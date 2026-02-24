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
    let matchedSong: { id: number; album?: { picUrl?: string }; al?: { picUrl?: string } } | null = null;

    // Try multiple search endpoints
    const endpoints = [
      {
        url: 'https://music.163.com/api/cloudsearch/get/web',
        method: 'POST' as const,
        body: `s=${encodeURIComponent(keyword)}&type=1&limit=3&offset=0`,
      },
      {
        url: 'https://music.163.com/api/search/get',
        method: 'POST' as const,
        body: `s=${encodeURIComponent(keyword)}&type=1&limit=3&offset=0`,
      },
      {
        url: `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=3&offset=0`,
        method: 'GET' as const,
        body: undefined,
      },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep.url, {
          method: ep.method,
          headers: {
            ...NETEASE_HEADERS,
            ...(ep.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          body: ep.body,
        });
        const data = await resp.json();
        const songs = data?.result?.songs;
        if (songs && songs.length > 0) {
          matchedSong = songs[0];
          console.log(`Found "${keyword}" via ${ep.url.split('?')[0]}, id=${matchedSong!.id}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!matchedSong) return result;

    result.neteaseId = matchedSong.id;

    // Get song detail (for album cover) and audio URL in parallel
    const [detailRes, audioRes] = await Promise.all([
      fetch(`https://music.163.com/api/song/detail/?ids=[${matchedSong.id}]&id=${matchedSong.id}`, {
        headers: NETEASE_HEADERS,
      }).then(r => r.json()).catch(() => null),
      fetch(`https://music.163.com/api/song/enhance/player/url?ids=[${matchedSong.id}]&br=128000`, {
        headers: NETEASE_HEADERS,
      }).then(r => r.json()).catch(() => null),
    ]);

    // Album cover from detail API
    const detailSong = detailRes?.songs?.[0];
    const picUrl = detailSong?.album?.picUrl || detailSong?.al?.picUrl || matchedSong.album?.picUrl || matchedSong.al?.picUrl;
    if (picUrl) {
      result.coverUrl = `${picUrl}?param=300y300`;
    }

    // Audio preview URL
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
