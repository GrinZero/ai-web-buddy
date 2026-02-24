import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type Song,
  type Scene,
  type UserPreference,
  selectDemoSongs,
  generatePlaylist,
  generateQuizQuestions,
  DISLIKE_REASONS,
  ENCOURAGEMENTS,
  getAlbumGradient,
} from '@/lib/vibeEngine';
import type { SceneResult } from '@/lib/useVibeStore';

type SubStage = 'rules' | 'demo' | 'quiz' | 'playlist';

interface DemoLoopStageProps {
  songs: Song[];
  scene: Scene;
  sceneIndex: number;
  totalScenes: number;
  usedSongs: Set<string>;
  onComplete: (result: SceneResult) => void;
  onBackToScenes: () => void;
  onRestart: () => void;
}

const MAX_TUNE_ROUNDS = 3;

export default function DemoLoopStage({
  songs, scene, sceneIndex, totalScenes, usedSongs,
  onComplete, onBackToScenes, onRestart,
}: DemoLoopStageProps) {
  const [subStage, setSubStage] = useState<SubStage>('rules');
  const [demoSongs, setDemoSongs] = useState<Song[]>([]);
  const [currentDemoIdx, setCurrentDemoIdx] = useState(0);
  const [preference, setPreference] = useState<UserPreference>({
    dislikedGenres: [], dislikedRhythms: [], dislikedStyles: [],
    likedSongs: [], quizAnswers: {},
  });
  const [showDislikePopup, setShowDislikePopup] = useState(false);
  const [dislikeCategory, setDislikeCategory] = useState<'type' | 'rhythm' | 'style' | null>(null);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [progress, setProgress] = useState(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCount = useRef(0);

  // Tuning state
  const [tuneRound, setTuneRound] = useState(0);
  const [tuneFeedback, setTuneFeedback] = useState<Record<string, 'like' | 'dislike'>>({});

  // Initialize demos
  const startDemos = useCallback(() => {
    const demos = selectDemoSongs(songs, scene, usedSongs);
    setDemoSongs(demos);
    setCurrentDemoIdx(0);
    setSubStage('demo');
    setProgress(20);
  }, [songs, scene, usedSongs]);

  const quizQuestions = generateQuizQuestions(songs.length, scene);

  // Handle click on demo (distinguish single/double)
  const handleDemoClick = useCallback(() => {
    clickCount.current += 1;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        // Single click - dislike
        clickCount.current = 0;
        setShaking(true);
        setTimeout(() => {
          setShaking(false);
          setShowDislikePopup(true);
        }, 500);
      }, 300);
    } else if (clickCount.current === 2) {
      // Double click - like
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickCount.current = 0;
      handleLike();
    }
  }, [currentDemoIdx, demoSongs]);

  const handleLike = () => {
    const song = demoSongs[currentDemoIdx];
    if (song) {
      setPreference(prev => ({ ...prev, likedSongs: [...prev.likedSongs, song] }));
    }
    setShowHeartAnim(true);
    setTimeout(() => {
      setShowHeartAnim(false);
      advanceDemo();
    }, 1000);
  };

  const advanceDemo = () => {
    if (currentDemoIdx < 3) {
      setCurrentDemoIdx(prev => prev + 1);
    } else {
      // All demos done
      setProgress(50);
      showEncouragementMsg('demoComplete', () => {
        setSubStage('quiz');
        setQuizIdx(0);
      });
    }
  };

  const handleDislikeReason = (category: 'type' | 'rhythm' | 'style') => {
    setDislikeCategory(category);
  };

  const handleDislikeDetail = (_detail: string) => {
    setShowDislikePopup(false);
    setDislikeCategory(null);
    advanceDemo();
  };

  const handleQuizAnswer = (answer: string) => {
    const q = quizQuestions[quizIdx];
    setPreference(prev => ({
      ...prev,
      quizAnswers: { ...prev.quizAnswers, [q.id]: answer },
    }));

    if (quizIdx < quizQuestions.length - 1) {
      setQuizIdx(prev => prev + 1);
    } else {
      // Quiz done
      setProgress(80);
      showEncouragementMsg('quizComplete', () => {
        const pl = generatePlaylist(songs, scene, preference, usedSongs);
        setPlaylist(pl);
        setTuneRound(0);
        setTuneFeedback({});
        setProgress(100);
        setSubStage('playlist');
        setTimeout(() => {
          showEncouragementMsg('playlistReady', () => {});
        }, 500);
      });
    }
  };

  const showEncouragementMsg = (type: 'demoComplete' | 'quizComplete' | 'playlistReady', callback: () => void) => {
    const msgs = ENCOURAGEMENTS[type];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    setEncouragement(msg);
    setTimeout(() => {
      setEncouragement(null);
      callback();
    }, 2500);
  };

  // Tuning: toggle feedback on a song in the playlist
  const toggleTuneFeedback = (songKey: string, type: 'like' | 'dislike') => {
    setTuneFeedback(prev => {
      const next = { ...prev };
      if (next[songKey] === type) {
        delete next[songKey];
      } else {
        next[songKey] = type;
      }
      return next;
    });
  };

  // Apply tuning: regenerate playlist based on feedback
  const applyTuning = () => {
    const dislikedKeys = new Set(
      Object.entries(tuneFeedback)
        .filter(([, v]) => v === 'dislike')
        .map(([k]) => k)
    );
    const likedKeys = new Set(
      Object.entries(tuneFeedback)
        .filter(([, v]) => v === 'like')
        .map(([k]) => k)
    );

    // Keep liked songs, remove disliked, fill from remaining pool
    const kept = playlist.filter(s => {
      const key = `${s.name}-${s.artist}`;
      return !dislikedKeys.has(key);
    });

    const usedKeys = new Set([
      ...Array.from(usedSongs),
      ...kept.map(s => `${s.name}-${s.artist}`),
    ]);

    // Update preference with liked songs from tuning
    const newLiked = playlist.filter(s => likedKeys.has(`${s.name}-${s.artist}`));
    setPreference(prev => ({
      ...prev,
      likedSongs: [...prev.likedSongs, ...newLiked],
    }));

    // Fill replacements
    const remaining = songs.filter(s => !usedKeys.has(`${s.name}-${s.artist}`));
    const needed = 10 - kept.length;
    const replacements = remaining.slice(0, Math.max(0, needed));

    const newPlaylist = [...kept, ...replacements].slice(0, 10);
    setPlaylist(newPlaylist);
    setTuneRound(prev => prev + 1);
    setTuneFeedback({});

    showEncouragementMsg('playlistReady', () => {});
  };

  const hasTuneFeedback = Object.keys(tuneFeedback).length > 0;

  const handleCompleteScene = () => {
    onComplete({ scene, playlist });
  };

  const currentDemo = demoSongs[currentDemoIdx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen flex-col items-center px-4 py-8"
    >
      {/* Header */}
      <div className="w-full max-w-2xl mb-6 flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={onBackToScenes} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">返回场景</button>
          <button onClick={onRestart} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">重新导入</button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-2xl">{scene.icon}</span>
          <span className="font-medium text-foreground">{scene.name}</span>
          <span>({sceneIndex + 1}/{totalScenes})</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            {subStage === 'demo' && `Demo 评价中 ${currentDemoIdx + 1}/4`}
            {subStage === 'quiz' && `选择题 ${quizIdx + 1}/${quizQuestions.length}`}
            {subStage === 'playlist' && (tuneRound > 0 ? `歌单已调优 (第${tuneRound}轮)` : '歌单已生成')}
            {subStage === 'rules' && '准备开始'}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="w-full max-w-2xl flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {/* Rules popup */}
          {subStage === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-popover/90 p-8 backdrop-blur-sm text-center"
            >
              <p className="mb-6 text-lg text-foreground">为了更懂你的 Vibe，帮你生成超精准歌单～</p>
              <div className="mb-6 space-y-3 text-left">
                <div className="flex items-center gap-3 rounded-xl bg-vibe-pink-light p-3">
                  <span className="text-2xl">💕</span>
                  <span className="text-sm text-foreground"><strong>双击</strong>：这首歌超合适（直接切下一首）</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                  <span className="text-2xl">❌</span>
                  <span className="text-sm text-foreground"><strong>单击</strong>：这首歌不太对（告诉我原因哦）</span>
                </div>
              </div>
              <button
                onClick={startDemos}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
              >
                我知道啦
              </button>
            </motion.div>
          )}

          {/* Demo display */}
          {subStage === 'demo' && currentDemo && (
            <motion.div
              key={`demo-${currentDemoIdx}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                <motion.div
                  onClick={handleDemoClick}
                  whileHover={{ scale: 1.05 }}
                  className={`flex h-44 w-44 cursor-pointer items-center justify-center rounded-2xl text-5xl font-serif text-white/80 select-none shadow-lg ${shaking ? 'animate-shake' : ''}`}
                  style={{ background: getAlbumGradient(currentDemo.name) }}
                >
                  {currentDemo.name.charAt(0)}
                </motion.div>
                {showHeartAnim && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="animate-heart-pop text-6xl">💕</span>
                  </div>
                )}
              </div>
              <h3 className="mt-6 text-xl font-medium text-foreground">{currentDemo.name}</h3>
              <p className="mt-1 text-muted-foreground">{currentDemo.artist}</p>
              <p className="mt-6 text-xs text-muted-foreground">双击封面表示喜欢，单击表示不太对</p>

              {/* Dislike popup */}
              <AnimatePresence>
                {showDislikePopup && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 backdrop-blur-sm"
                    onClick={(e) => e.target === e.currentTarget && null}
                  >
                    <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-6">
                      {!dislikeCategory ? (
                        <>
                          <p className="mb-4 text-center text-sm text-foreground">告诉我哪里不对味？</p>
                          <div className="space-y-2">
                            {(Object.entries(DISLIKE_REASONS) as [('type' | 'rhythm' | 'style'), typeof DISLIKE_REASONS.type][]).map(([key, val]) => (
                              <button
                                key={key}
                                onClick={() => handleDislikeReason(key)}
                                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground hover:bg-secondary transition-colors"
                              >
                                <span className="text-xl">{val.icon}</span>
                                <span>{val.label}</span>
                              </button>
                            ))}
                          </div>
                          <p className="mt-3 text-center text-xs text-muted-foreground">选一个原因，我会更懂你哦</p>
                        </>
                      ) : (
                        <>
                          <p className="mb-4 text-center text-sm text-foreground">
                            {DISLIKE_REASONS[dislikeCategory].icon} 具体是哪里不对？
                          </p>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {DISLIKE_REASONS[dislikeCategory].details.map((detail) => (
                              <button
                                key={detail}
                                onClick={() => handleDislikeDetail(detail)}
                                className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                {detail}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setDislikeCategory(null)}
                            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            ← 返回选择原因
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Quiz */}
          {subStage === 'quiz' && quizQuestions[quizIdx] && (
            <motion.div
              key={`quiz-${quizIdx}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-md"
            >
              <div className="rounded-2xl border border-border bg-card p-6">
                <p className="mb-1 text-xs text-muted-foreground">问题 {quizIdx + 1} / {quizQuestions.length}</p>
                <h3 className="mb-6 text-lg font-medium text-foreground">{quizQuestions[quizIdx].question}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {quizQuestions[quizIdx].options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleQuizAnswer(opt)}
                      className="rounded-xl border border-border bg-background p-3 text-sm text-foreground hover:border-primary hover:bg-vibe-pink-light transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {quizIdx > 0 && (
                  <button
                    onClick={() => setQuizIdx(prev => prev - 1)}
                    className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← 上一题
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Playlist result with tuning */}
          {subStage === 'playlist' && (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg"
            >
              <div className="mb-4 text-center">
                <span className="text-3xl">{scene.icon}</span>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{scene.name} · {playlist.length} 首</h2>
                {tuneRound < MAX_TUNE_ROUNDS && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    点击 👍/👎 标记歌曲，然后点「调优歌单」替换不喜欢的歌（还可调优 {MAX_TUNE_ROUNDS - tuneRound} 轮）
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {playlist.map((song, i) => {
                  const key = `${song.name}-${song.artist}`;
                  const feedback = tuneFeedback[key];
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex items-center gap-4 rounded-xl border p-3 transition-colors ${
                        feedback === 'like'
                          ? 'border-primary bg-vibe-pink-light'
                          : feedback === 'dislike'
                          ? 'border-destructive/30 bg-destructive/5'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-serif text-white/80"
                        style={{ background: getAlbumGradient(song.name) }}
                      >
                        {song.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{song.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                      </div>
                      {tuneRound < MAX_TUNE_ROUNDS && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => toggleTuneFeedback(key, 'like')}
                            className={`rounded-lg px-2 py-1 text-sm transition-all ${
                              feedback === 'like'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                            }`}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => toggleTuneFeedback(key, 'dislike')}
                            className={`rounded-lg px-2 py-1 text-sm transition-all ${
                              feedback === 'dislike'
                                ? 'bg-destructive text-destructive-foreground'
                                : 'bg-secondary text-muted-foreground hover:bg-destructive/20'
                            }`}
                          >
                            👎
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-center gap-3">
                {tuneRound < MAX_TUNE_ROUNDS && hasTuneFeedback && (
                  <button
                    onClick={applyTuning}
                    className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    🔄 调优歌单（第{tuneRound + 1}轮）
                  </button>
                )}
                <button
                  onClick={handleCompleteScene}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
                >
                  {sceneIndex < totalScenes - 1 ? '下一场景 →' : '查看所有歌单 →'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Encouragement overlay */}
      <AnimatePresence>
        {encouragement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setEncouragement(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/5 backdrop-blur-sm"
          >
            <div className="rounded-2xl border border-border bg-popover/95 px-8 py-6 text-center shadow-xl backdrop-blur-sm">
              <p className="text-lg text-foreground">{encouragement}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
