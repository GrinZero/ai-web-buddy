const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Fallback: directly parse NetEase playlist page
async function fallbackNetEase(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    // Resolve short URL
    let resolvedUrl = url;
    try {
      const resp = await fetch(url, { redirect: 'follow' });
      resolvedUrl = resp.url;
      await resp.text(); // consume body
    } catch { /* use original */ }

    // Extract playlist ID from URL
    const idMatch = resolvedUrl.match(/[?&]id=(\d+)/);
    if (!idMatch) {
      return new Response(
        JSON.stringify({ success: false, error: '无法从链接中提取歌单ID' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }
    const playlistId = idMatch[1];
    console.log('Fallback: extracted playlist ID:', playlistId);

    // Use NetEase Cloud Music API to get playlist details
    const apiUrl = `https://music.163.com/api/playlist/detail?id=${playlistId}`;
    const resp = await fetch(apiUrl, {
      headers: {
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = await resp.json();
    if (data.code !== 200 || !data.result?.tracks) {
      return new Response(
        JSON.stringify({ success: false, error: '歌单获取失败，可能是私密歌单或链接无效' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const songs = data.result.tracks.map((track: { name: string; artists: { name: string }[] }) => {
      const artists = track.artists?.map((a: { name: string }) => a.name).join('/') || '未知';
      return `${track.name} - ${artists}`;
    });

    console.log(`Fallback parsed ${songs.length} songs`);
    return new Response(
      JSON.stringify({ success: true, songs, count: songs.length }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fallback parse error:', error);
    return new Response(
      JSON.stringify({ success: false, error: '歌单解析失败，请尝试使用文本导入' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: '请输入歌单链接' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL pattern
    const supportedPatterns = [/163cn/i, /\.163\./i, /\.qq\./i, /qishui/i, /douyin/i];
    const isSupported = supportedPatterns.some(pattern => pattern.test(url));
    if (!isSupported) {
      return new Response(
        JSON.stringify({ success: false, error: '不支持的链接格式，目前支持网易云、QQ音乐、汽水音乐的歌单链接' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing playlist URL:', url);

    // Try GoMusic API first
    const formData = new URLSearchParams();
    formData.append('url', url);

    try {
      const response = await fetch('https://music.unmeta.cn/songlist?format=song-singer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Origin': 'https://music.unmeta.cn',
          'Referer': 'https://music.unmeta.cn/',
        },
        body: formData.toString(),
      });

      const text = await response.text();
      const data = JSON.parse(text);

      if (data.code === 200 && data.data) {
        const songs = data.data?.songs || data.data?.Songs || [];
        if (songs.length > 0) {
          console.log(`GoMusic parsed ${songs.length} songs`);
          return new Response(
            JSON.stringify({ success: true, songs, count: songs.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch {
      console.log('GoMusic API unavailable, trying fallback...');
    }

    // Fallback: direct NetEase API
    const isNetEase = /163cn|\.163\./i.test(url);
    if (isNetEase) {
      return await fallbackNetEase(url, corsHeaders);
    }

    return new Response(
      JSON.stringify({ success: false, error: '歌单解析服务暂时不可用，请稍后重试或使用文本导入' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing playlist:', error);
    const errorMessage = error instanceof Error ? error.message : '解析过程出现错误';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
