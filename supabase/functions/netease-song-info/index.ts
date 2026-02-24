const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NETEASE_HEADERS = {
  'Referer': 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Cookie': 'os=ios; appver=9.0.95;',
  'Accept': '*/*',
};

interface SongQuery {
  name: string;
  artist: string;
}

interface SongResult {
  name: string;
  artist: string;
  coverUrl: string | null;
  previewUrl: string | null;
  neteaseId: number | null;
}

// Normalize string for fuzzy matching
function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[\s\-_·,.，。、（）()\[\]【】]/g, '')
    .replace(/[''""\"\']/g, '');
}

// Check if search result matches query (fuzzy)
function isGoodMatch(
  querySongName: string,
  queryArtist: string,
  resultSongName: string,
  resultArtists: string[]
): boolean {
  const qName = normalize(querySongName);
  const rName = normalize(resultSongName);

  // Song name must substantially overlap
  const nameMatch = rName.includes(qName) || qName.includes(rName) ||
    (qName.length > 2 && rName.length > 2 && (
      levenshteinRatio(qName, rName) > 0.6
    ));

  if (!nameMatch) return false;

  // Artist check: at least one artist token should match
  const qArtistTokens = queryArtist.split(/[/,&、\s]+/).map(normalize).filter(Boolean);
  const rArtistAll = resultArtists.map(normalize);

  const artistMatch = qArtistTokens.some(qt =>
    rArtistAll.some(ra => ra.includes(qt) || qt.includes(ra))
  );

  return artistMatch;
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

async function searchSong(song: SongQuery): Promise<SongResult> {
  const result: SongResult = {
    name: song.name,
    artist: song.artist,
    coverUrl: null,
    previewUrl: null,
    neteaseId: null,
  };

  try {
    const keyword = `${song.name} ${song.artist}`;
    let matchedSong: { id: number; name?: string; artists?: { name: string }[]; ar?: { name: string }[]; album?: { picUrl?: string }; al?: { picUrl?: string } } | null = null;

    const endpoints = [
      {
        url: 'https://music.163.com/api/cloudsearch/get/web',
        method: 'POST' as const,
        body: `s=${encodeURIComponent(keyword)}&type=1&limit=10&offset=0`,
      },
      {
        url: 'https://music.163.com/api/search/get',
        method: 'POST' as const,
        body: `s=${encodeURIComponent(keyword)}&type=1&limit=10&offset=0`,
      },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep.url, {
          method: ep.method,
          headers: {
            ...NETEASE_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: ep.body,
        });
        const data = await resp.json();
        const songs = data?.result?.songs;
        if (songs && songs.length > 0) {
          // Find best match among results
          for (const s of songs) {
            const sName = s.name || '';
            const sArtists = (s.artists || s.ar || []).map((a: { name: string }) => a.name);
            if (isGoodMatch(song.name, song.artist, sName, sArtists)) {
              matchedSong = s;
              console.log(`Matched "${keyword}" -> "${sName}" by ${sArtists.join('/')} (id=${s.id})`);
              break;
            }
          }
          if (matchedSong) break;
          // Fallback: if no good match found in top 10, skip this endpoint
        }
      } catch {
        continue;
      }
    }

    if (!matchedSong) {
      console.log(`No match found for "${keyword}"`);
      return result;
    }

    result.neteaseId = matchedSong.id;

    // Get song detail and audio URL in parallel
    const [detailRes, audioRes] = await Promise.all([
      fetch(`https://music.163.com/api/song/detail/?ids=[${matchedSong.id}]&id=${matchedSong.id}`, {
        headers: NETEASE_HEADERS,
      }).then(r => r.json()).catch(() => null),
      fetch(`https://music.163.com/api/song/enhance/player/url?ids=[${matchedSong.id}]&br=128000`, {
        headers: NETEASE_HEADERS,
      }).then(r => r.json()).catch(() => null),
    ]);

    const detailSong = detailRes?.songs?.[0];
    const picUrl = detailSong?.album?.picUrl || detailSong?.al?.picUrl || matchedSong.album?.picUrl || matchedSong.al?.picUrl;
    if (picUrl) {
      result.coverUrl = `${picUrl}?param=300y300`;
    }

    const urlInfo = audioRes?.data?.[0];
    if (urlInfo?.url) {
      result.previewUrl = urlInfo.url;
    }
  } catch (e) {
    console.error(`Search failed for ${song.name} - ${song.artist}:`, e);
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songs } = await req.json() as { songs: SongQuery[] };

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: '请提供歌曲列表' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batch = songs.slice(0, 20);
    const CONCURRENCY = 5;
    const results: SongResult[] = [];

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(searchSong));
      results.push(...chunkResults);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in netease-song-info:', error);
    return new Response(
      JSON.stringify({ success: false, error: '歌曲信息获取失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
