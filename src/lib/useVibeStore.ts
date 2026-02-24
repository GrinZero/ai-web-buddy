import { useState, useCallback } from 'react';
import type { Song, Scene, DemoFeedback, UserPreference } from './vibeEngine';

export type Stage = 'input' | 'scene-select' | 'demo-loop' | 'export';

export interface SceneResult {
  scene: Scene;
  playlist: Song[];
}

export function useVibeStore() {
  const [stage, setStage] = useState<Stage>('input');
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [sceneResults, setSceneResults] = useState<SceneResult[]>([]);
  const [usedSongs, setUsedSongs] = useState<Set<string>>(new Set());

  const currentScene = selectedScenes[currentSceneIndex] || null;

  const goToSceneSelect = useCallback((parsedSongs: Song[]) => {
    setSongs(parsedSongs);
    setStage('scene-select');
  }, []);

  const startDemoLoop = useCallback((scenes: Scene[]) => {
    setSelectedScenes(scenes);
    setCurrentSceneIndex(0);
    setSceneResults([]);
    setUsedSongs(new Set());
    setStage('demo-loop');
  }, []);

  const completeScene = useCallback((result: SceneResult) => {
    setSceneResults(prev => [...prev, result]);
    // Mark songs as used
    setUsedSongs(prev => {
      const next = new Set(prev);
      result.playlist.forEach(s => next.add(`${s.name}-${s.artist}`));
      return next;
    });

    if (currentSceneIndex < selectedScenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    } else {
      setStage('export');
    }
  }, [currentSceneIndex, selectedScenes.length]);

  const resetAll = useCallback(() => {
    setStage('input');
    setSongs([]);
    setSelectedScenes([]);
    setCurrentSceneIndex(0);
    setSceneResults([]);
    setUsedSongs(new Set());
  }, []);

  const goBackToSceneSelect = useCallback(() => {
    setStage('scene-select');
    setCurrentSceneIndex(0);
    setSceneResults([]);
    setUsedSongs(new Set());
  }, []);

  return {
    stage,
    songs,
    selectedScenes,
    currentSceneIndex,
    currentScene,
    sceneResults,
    usedSongs,
    goToSceneSelect,
    startDemoLoop,
    completeScene,
    resetAll,
    goBackToSceneSelect,
  };
}
