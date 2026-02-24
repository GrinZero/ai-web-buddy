import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const inflight = useRef<Set<string>>(new Set());

  const getKey = (name: string, artist: string) => `${name}-${artist}`;

  const fetchBatch = useCallback(async (songs: { name: string; artist: string }[]) => {
    // Filter out already cached or in-flight
    const toFetch = songs.filter(s => {
      const key = getKey(s.name, s.artist);
      return !cache[key] && !inflight.current.has(key);
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
      const { data, error } = await supabase.functions.invoke('netease-song-info', {
        body: { songs: toFetch.map(s => ({ name: s.name, artist: s.artist })) },
      });

      if (error || !data?.success) {
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

      const results = data.results as Array<{
        name: string; artist: string;
        coverUrl: string | null; previewUrl: string | null; neteaseId: number | null;
      }>;

      const successEntries: MediaCache = {};
      results.forEach(r => {
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
  }, [cache]);

  const getInfo = useCallback((name: string, artist: string): SongMediaInfo => {
    return cache[getKey(name, artist)] || { coverUrl: null, previewUrl: null, neteaseId: null, loading: false };
  }, [cache]);

  return { fetchBatch, getInfo, cache };
}

/**
 * Tiny inline audio player component for song previews.
 * Plays a 12-14s snippet then auto-stops.
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const toggle = useCallback(() => {
    if (!previewUrl || !audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      setPlaying(true);
      // Auto-stop after 14s
      timerRef.current = setTimeout(() => {
        audioRef.current?.pause();
        setPlaying(false);
      }, 14000);
    }
  }, [previewUrl, playing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  if (!previewUrl) return null;

  return (
    <>
      <audio ref={audioRef} src={previewUrl} preload="none" />
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0"
        title={playing ? '暂停' : `试听 ${songName}`}
      >
        {playing ? '⏸' : '▶'}
      </button>
    </>
  );
}
