import { useState, useCallback, useRef, useEffect } from 'react';

export interface SongMediaInfo {
  coverUrl: string | null;
  previewUrl: string | null;
  neteaseId: number | null;
  loading: boolean;
}

type MediaCache = Record<string, SongMediaInfo>;

/**
 * Hook to batch-fetch and cache NetEase song metadata (covers + audio).
 * Call `fetchBatch` with an array of {name, artist} to load their info.
 * Results are cached by "name-artist" key.
 */
export function useNeteaseInfo() {
  const [cache, setCache] = useState<MediaCache>({});
  const cacheRef = useRef<MediaCache>({});
  const inflight = useRef<Set<string>>(new Set());

  // Keep ref in sync with state
  cacheRef.current = cache;

  const getKey = (name: string, artist: string) => `${name}-${artist}`;

  const fetchBatch = useCallback(async (songs: { name: string; artist: string }[]) => {
    // Use ref to read cache to avoid stale closure
    const currentCache = cacheRef.current;
    const toFetch = songs.filter(s => {
      const key = getKey(s.name, s.artist);
      return !currentCache[key] && !inflight.current.has(key);
    });

    if (toFetch.length === 0) return;

    // Mark as loading
    const loadingEntries: MediaCache = {};
    toFetch.forEach(s => {
      const key = getKey(s.name, s.artist);
      inflight.current.add(key);
      loadingEntries[key] = { coverUrl: null, previewUrl: null, neteaseId: null, loading: true };
    });
    setCache(prev => ({ ...prev, ...loadingEntries }));

    try {
      const neteaseApiUrl = 'https://netease-api-enhanced-opal.vercel.app';
      
      // Fetch song info for each song
      const results = [];
      for (const song of toFetch) {
        try {
          // Search for song
          const searchRes = await fetch(`${neteaseApiUrl}/search?keywords=${encodeURIComponent(song.name + ' ' + song.artist)}&type=1&limit=1`);
          const searchData = await searchRes.json();
          
          if (searchData.result?.songs?.[0]) {
            const songData = searchData.result.songs[0];
            const songId = songData.id;
            
            // Get song URL
            const urlRes = await fetch(`${neteaseApiUrl}/song/url?id=${songId}&br=128000`);
            const urlData = await urlRes.json();
            
            results.push({
              name: song.name,
              artist: song.artist,
              coverUrl: songData.al?.picUrl ? `${songData.al.picUrl}?param=300y300` : null,
              previewUrl: urlData.data?.[0]?.url || null,
              neteaseId: songId,
            });
          } else {
            results.push({
              name: song.name,
              artist: song.artist,
              coverUrl: null,
              previewUrl: null,
              neteaseId: null,
            });
          }
        } catch {
          results.push({
            name: song.name,
            artist: song.artist,
            coverUrl: null,
            previewUrl: null,
            neteaseId: null,
          });
        }
      }

      if (!results || results.length === 0) {
        // Mark all as failed (loading: false, no data)
        const failEntries: MediaCache = {};
        toFetch.forEach(s => {
          const key = getKey(s.name, s.artist);
          inflight.current.delete(key);
          failEntries[key] = { coverUrl: null, previewUrl: null, neteaseId: null, loading: false };
        });
        setCache(prev => ({ ...prev, ...failEntries }));
        return;
      }

      const finalResults = results as Array<{
        name: string; artist: string;
        coverUrl: string | null; previewUrl: string | null; neteaseId: number | null;
      }>;

      const successEntries: MediaCache = {};
      finalResults.forEach(r => {
        const key = getKey(r.name, r.artist);
        inflight.current.delete(key);
        successEntries[key] = {
          coverUrl: r.coverUrl,
          previewUrl: r.previewUrl,
          neteaseId: r.neteaseId,
          loading: false,
        };
      });
      // Also mark any missing as done
      toFetch.forEach(s => {
        const key = getKey(s.name, s.artist);
        if (!successEntries[key]) {
          inflight.current.delete(key);
          successEntries[key] = { coverUrl: null, previewUrl: null, neteaseId: null, loading: false };
        }
      });
      setCache(prev => ({ ...prev, ...successEntries }));
    } catch {
      const failEntries: MediaCache = {};
      toFetch.forEach(s => {
        const key = getKey(s.name, s.artist);
        inflight.current.delete(key);
        failEntries[key] = { coverUrl: null, previewUrl: null, neteaseId: null, loading: false };
      });
      setCache(prev => ({ ...prev, ...failEntries }));
    }
  }, []);

  const getInfo = useCallback((name: string, artist: string): SongMediaInfo => {
    return cache[getKey(name, artist)] || { coverUrl: null, previewUrl: null, neteaseId: null, loading: false };
  }, [cache]);

  return { fetchBatch, getInfo, cache };
}

/**
 * Tiny inline audio player component for song previews.
 * Uses backend audio clipping service to play intro + chorus (5s + 8s = 13s).
 */
export function MiniPlayer({ 
  previewUrl, 
  songName 
}: { 
  previewUrl: string | null; 
  songName: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [clippedUrl, setClippedUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Generate clipped audio URL from backend
  useEffect(() => {
    if (previewUrl) {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
      const clipped = `${apiBaseUrl}/audio/preview?url=${encodeURIComponent(previewUrl)}`;
      setClippedUrl(clipped);
    }
  }, [previewUrl]);

  const toggle = useCallback(() => {
    if (!clippedUrl || !audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      setPlaying(true);
      // Auto-stop after 14s (in case clipping fails, fallback to full audio)
      timerRef.current = setTimeout(() => {
        audioRef.current?.pause();
        setPlaying(false);
      }, 14000);
    }
  }, [clippedUrl, playing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  return (
    <>
      {clippedUrl && <audio ref={audioRef} src={clippedUrl} preload="none" />}
      <button
        onClick={(e) => { 
          e.stopPropagation(); 
          if (!clippedUrl) {
            alert('No audio available');
            return;
          }
          toggle(); 
        }}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors shrink-0 ${
          clippedUrl 
            ? 'bg-primary/10 text-primary hover:bg-primary/20' 
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
        title={!clippedUrl ? 'No audio' : (playing ? 'Pause' : `Play ${songName}`)}
      >
        {playing ? '⏸' : '▶'}
      </button>
    </>
  );
}
