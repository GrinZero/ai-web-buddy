import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type Song,
  type Scene,
  type UserPreference,
  type QuizQuestion,
  type PlaylistVersion,
  selectDemoPool,
  selectDemoBatch,
  generatePlaylist,
  generateQuizQuestions,
  getSwapPreferenceQuestion,
  collectPreviousVersionKeys,
  DISLIKE_REASONS,
  ENCOURAGEMENTS,
  getAlbumGradient,
} from '@/lib/vibeEngine';
import type { SceneResult } from '@/lib/useVibeStore';
import { useNeteaseInfo, MiniPlayer } from '@/hooks/useNeteaseInfo';

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
const MIN_LIKES = 4;

export default function DemoLoopStage({
  songs, scene, sceneIndex, totalScenes, usedSongs,
  onComplete, onBackToScenes, onRestart,
}: DemoLoopStageProps) {
  const [subStage, setSubStage] = useState<SubStage>('rules');
  
  // V4: Demo pool system
  const [demoPool, setDemoPool] = useState<Song[]>([]);
  const [demoBatch, setDemoBatch] = useState<Song[]>([]);
  const [shownDemoKeys, setShownDemoKeys] = useState<Set<string>>(new Set());
  const [currentDemoIdx, setCurrentDemoIdx] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [likedInDemo, setLikedInDemo] = useState<Set<string>>(new Set()); // track liked for undo
  const [preference, setPreference] = useState<UserPreference>({
    dislikedGenres: [], dislikedRhythms: [], dislikedStyles: [],
    likedSongs: [], quizAnswers: {},
  });

  // Demo interaction state
  const [showDislikePopup, setShowDislikePopup] = useState(false);
  const [dislikeCategory, setDislikeCategory] = useState<'type' | 'rhythm' | 'style' | null>(null);
  const [dislikeDetail, setDislikeDetail] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [showNeedMoreLikes, setShowNeedMoreLikes] = useState(false);
  const [reEvalCount, setReEvalCount] = useState(0);
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [canUndoLike, setCanUndoLike] = useState(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelections, setQuizSelections] = useState<Record<string, Set<string>>>({});
  const [usedPrefIds, setUsedPrefIds] = useState<Set<string>>(new Set());
  const [swapToast, setSwapToast] = useState<string | null>(null);

  // V4: Playlist version system
  const [versions, setVersions] = useState<PlaylistVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0); // index into versions
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [showLikeOptions, setShowLikeOptions] = useState<string | null>(null);
  const [showDislikeOptions, setShowDislikeOptions] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);

  // All demo keys for quiz exclusion
  const allDemoKeys = useMemo(() => new Set(demoPool.map(s => `${s.name}-${s.artist}`)), [demoPool]);

  // Current version data
  const currentVersionData = versions[currentVersion];
  const playlist = currentVersionData?.playlist || [];
  const tuneLikes = currentVersionData?.tuneLikes || {};
  const tuneDislikes = currentVersionData?.tuneDislikes || {};

  const displayedPlaylist = showAllSongs ? playlist : playlist.slice(0, 10);

  // NetEase media integration
  const { fetchBatch, getInfo } = useNeteaseInfo();

  // Fetch media for demo batch
  useEffect(() => {
    if (demoBatch.length > 0) {
      fetchBatch(demoBatch.map(s => ({ name: s.name, artist: s.artist })));
    }
  }, [demoBatch]);

  // Fetch media for quiz empirical songs
  useEffect(() => {
    if (subStage === 'quiz' && quizQuestions.length > 0) {
      const empiricalSongs = quizQuestions
        .filter(q => q.type === 'empirical')
        .flatMap(q => q.options.filter(o => o.songRef).map(o => {
          const parts = o.songRef!.split('-');
          return { name: parts[0], artist: parts.slice(1).join('-') };
        }));
      if (empiricalSongs.length > 0) fetchBatch(empiricalSongs);
    }
  }, [subStage, quizQuestions]);

  // Fetch media for playlist top 10
  useEffect(() => {
    if (subStage === 'playlist' && playlist.length > 0) {
      fetchBatch(playlist.slice(0, 10).map(s => ({ name: s.name, artist: s.artist })));
    }
  }, [subStage, playlist]);

  // ========== Demo init ==========
  const startDemos = useCallback(() => {
    const pool = selectDemoPool(songs, scene, usedSongs);
    setDemoPool(pool);
    const batch = selectDemoBatch(pool, new Set(), Math.min(pool.length, 6));
    setDemoBatch(batch);
    setShownDemoKeys(new Set(batch.map(s => `${s.name}-${s.artist}`)));
    setCurrentDemoIdx(0);
    setLikeCount(0);
    setLikedInDemo(new Set());
    setCanUndoLike(false);
    setSubStage('demo');
    setProgress(40);
  }, [songs, scene, usedSongs]);

  // ========== Demo handlers ==========
  const currentDemo = demoBatch[currentDemoIdx];
  const skipLikeRequirement = demoPool.length < MIN_LIKES;

  const handleLike = () => {
    const song = currentDemo;
    if (!song) return;
    const key = `${song.name}-${song.artist}`;
    
    setPreference(prev => ({ ...prev, likedSongs: [...prev.likedSongs, song] }));
    setLikeCount(prev => prev + 1);
    setLikedInDemo(prev => new Set(prev).add(key));
    
    setShowHeartAnim(true);
    setCanUndoLike(true);
    
    // Allow undo within 3 seconds
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => setCanUndoLike(false), 3000);
    setUndoTimer(timer);
    
    setTimeout(() => {
      setShowHeartAnim(false);
      advanceDemo();
    }, 800);
  };

  const handleUndoLike = () => {
    if (!canUndoLike || !currentDemo) return;
    const key = `${currentDemo.name}-${currentDemo.artist}`;
    setPreference(prev => ({
      ...prev,
      likedSongs: prev.likedSongs.filter(s => `${s.name}-${s.artist}` !== key),
    }));
    setLikeCount(prev => Math.max(0, prev - 1));
    setLikedInDemo(prev => { const n = new Set(prev); n.delete(key); return n; });
    setCanUndoLike(false);
    if (undoTimer) clearTimeout(undoTimer);
  };

  const handleDislike = () => {
    setShowDislikePopup(true);
    setDislikeCategory(null);
    setDislikeDetail(null);
    setShowFollowUp(false);
  };

  const handleDislikeCategory = (cat: 'type' | 'rhythm' | 'style') => {
    setDislikeCategory(cat);
  };

  const handleDislikeDetail = (detail: string) => {
    const cat = DISLIKE_REASONS[dislikeCategory!];
    if (cat.hasFollowUp && dislikeCategory === 'type') {
      setDislikeDetail(detail);
      setShowFollowUp(true);
    } else {
      finishDislike();
    }
  };

  const handleFollowUpAnswer = (_yes: boolean) => {
    finishDislike();
  };

  const finishDislike = () => {
    setShowDislikePopup(false);
    setDislikeCategory(null);
    setDislikeDetail(null);
    setShowFollowUp(false);
    advanceDemo();
  };

  const advanceDemo = () => {
    setCanUndoLike(false);
    if (currentDemoIdx < demoBatch.length - 1) {
      setCurrentDemoIdx(prev => prev + 1);
    } else {
      // All demos in batch done
      const currentLikes = likeCount + (likedInDemo.has(`${currentDemo?.name}-${currentDemo?.artist}`) ? 0 : 0);
      if (currentLikes >= MIN_LIKES || skipLikeRequirement) {
        setProgress(50);
        if (skipLikeRequirement) {
          showToast('当前场景适配歌曲较少，已为你跳过喜欢数量要求，继续生成歌单哦✨');
        }
        showEncouragementMsg('demoComplete', () => {
          const qs = generateQuizQuestions(songs, scene, allDemoKeys, usedSongs);
          setQuizQuestions(qs);
          setQuizIdx(0);
          setQuizSelections({});
          setSubStage('quiz');
        });
      } else {
        setShowNeedMoreLikes(true);
      }
    }
  };

  const handleReEvaluate = () => {
    setShowNeedMoreLikes(false);
    setReEvalCount(prev => prev + 1);
    // Get new batch from pool, excluding already shown
    const newBatch = selectDemoBatch(demoPool, shownDemoKeys, Math.min(demoPool.length - shownDemoKeys.size, 6));
    if (newBatch.length === 0) {
      // All pool exhausted, reset shown keys and reshuffle
      const freshBatch = selectDemoBatch(demoPool, new Set(), Math.min(demoPool.length, 6));
      setDemoBatch(freshBatch);
      setShownDemoKeys(new Set(freshBatch.map(s => `${s.name}-${s.artist}`)));
    } else {
      setDemoBatch(newBatch);
      setShownDemoKeys(prev => {
        const next = new Set(prev);
        newBatch.forEach(s => next.add(`${s.name}-${s.artist}`));
        return next;
      });
    }
    setCurrentDemoIdx(0);
    setLikeCount(0);
    setLikedInDemo(new Set());
    setPreference(prev => ({ ...prev, likedSongs: [] }));
    setProgress(40);
  };

  // ========== Quiz handlers ==========
  const currentQuiz = quizQuestions[quizIdx];

  const toggleQuizOption = (questionId: string, option: string) => {
    setQuizSelections(prev => {
      const current = new Set(prev[questionId] || []);
      if (current.has(option)) current.delete(option);
      else current.add(option);
      return { ...prev, [questionId]: current };
    });
  };

  const handleQuizNext = () => {
    const sel = quizSelections[currentQuiz.id];
    if (sel && sel.size > 0) {
      setPreference(prev => ({
        ...prev,
        quizAnswers: { ...prev.quizAnswers, [currentQuiz.id]: Array.from(sel) },
      }));
    }

    if (quizIdx < quizQuestions.length - 1) {
      setQuizIdx(prev => prev + 1);
      setProgress(50 + Math.round(((quizIdx + 1) / quizQuestions.length) * 30));
    } else {
      setProgress(80);
      showEncouragementMsg('quizComplete', () => {
        const pl = generatePlaylist(songs, scene, preference, usedSongs, allDemoKeys, new Set());
        const v: PlaylistVersion = {
          version: 1,
          playlist: pl,
          tuneLikes: {},
          tuneDislikes: {},
          allSongKeys: new Set(pl.map(s => `${s.name}-${s.artist}`)),
        };
        setVersions([v]);
        setCurrentVersion(0);
        setShowAllSongs(false);
        setProgress(100);
        setSubStage('playlist');
        setTimeout(() => showEncouragementMsg('playlistReady', () => {}), 500);
      });
    }
  };

  const handleSwapQuestion = () => {
    if (!currentQuiz || !currentQuiz.swappable) {
      setSwapToast('本题为实证题，无法更换，请根据偏好选择哦');
      setTimeout(() => setSwapToast(null), 2000);
      return;
    }
    const newQ = getSwapPreferenceQuestion(currentQuiz.id, usedPrefIds);
    if (newQ) {
      setUsedPrefIds(prev => new Set([...prev, currentQuiz.id]));
      const newQuestions = [...quizQuestions];
      newQuestions[quizIdx] = newQ;
      setQuizQuestions(newQuestions);
    } else {
      setSwapToast('没有更多备用题了哦');
      setTimeout(() => setSwapToast(null), 2000);
    }
  };

  // ========== V4: Playlist version handlers ==========
  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 2000);
  };

  const updateCurrentVersion = (updater: (v: PlaylistVersion) => PlaylistVersion) => {
    setVersions(prev => prev.map((v, i) => i === currentVersion ? updater(v) : v));
  };

  const toggleLike = (key: string) => {
    const isLiked = !!tuneLikes[key];
    if (isLiked) {
      // Cancel like - remove added songs
      updateCurrentVersion(v => {
        const newLikes = { ...v.tuneLikes };
        delete newLikes[key];
        return { ...v, tuneLikes: newLikes };
      });
      setShowLikeOptions(null);
      showToast('已取消操作哦✨');
    } else {
      // Remove dislike if any
      updateCurrentVersion(v => {
        const newDislikes = { ...v.tuneDislikes };
        delete newDislikes[key];
        return { ...v, tuneDislikes: newDislikes, tuneLikes: { ...v.tuneLikes, [key]: { sameStyle: false, sameArtist: false } } };
      });
      setShowDislikeOptions(null);
      setShowLikeOptions(key);
    }
  };

  const setLikeOption = (key: string, option: 'sameStyle' | 'sameArtist') => {
    updateCurrentVersion(v => ({
      ...v,
      tuneLikes: {
        ...v.tuneLikes,
        [key]: { ...v.tuneLikes[key], [option]: !v.tuneLikes[key]?.[option] },
      },
    }));
  };

  const confirmLikeOptions = () => {
    setShowLikeOptions(null);
    showToast('已为你新增同类型歌曲✅');
  };

  const toggleDislike = (key: string) => {
    const isDisliked = tuneDislikes[key] !== undefined && tuneDislikes[key] !== null;
    if (isDisliked) {
      updateCurrentVersion(v => {
        const newDislikes = { ...v.tuneDislikes };
        delete newDislikes[key];
        return { ...v, tuneDislikes: newDislikes };
      });
      setShowDislikeOptions(null);
      showToast('已恢复删除的歌曲哦✨');
    } else {
      // Remove like if any
      updateCurrentVersion(v => {
        const newLikes = { ...v.tuneLikes };
        delete newLikes[key];
        return { ...v, tuneLikes: newLikes, tuneDislikes: { ...v.tuneDislikes, [key]: null } };
      });
      setShowLikeOptions(null);
      setShowDislikeOptions(key);
    }
  };

  const setDislikeOption = (key: string, option: 'single' | 'style') => {
    updateCurrentVersion(v => ({ ...v, tuneDislikes: { ...v.tuneDislikes, [key]: option } }));
    setShowDislikeOptions(null);
    showToast(option === 'single' ? '已删除这首歌曲✅' : '已剔除该风格所有歌曲✅');
  };

  const hasTuneFeedback = Object.keys(tuneLikes).length > 0 || Object.values(tuneDislikes).some(v => v !== null);

  // V4: Apply tuning -> generate new version
  const applyTuning = () => {
    if (!hasTuneFeedback || versions.length >= MAX_TUNE_ROUNDS) return;

    // Collect all previous version keys
    const prevKeys = collectPreviousVersionKeys(versions);

    // Generate new playlist excluding all previous versions
    const newPl = generatePlaylist(songs, scene, preference, usedSongs, allDemoKeys, prevKeys);

    if (newPl.length === 0) {
      showToast('宝～当前已无新的贴合歌曲啦🥺，可切换至之前版本查看或直接导出哦');
      return;
    }

    const newVersion: PlaylistVersion = {
      version: versions.length + 1,
      playlist: newPl,
      tuneLikes: {},
      tuneDislikes: {},
      allSongKeys: new Set(newPl.map(s => `${s.name}-${s.artist}`)),
    };

    setVersions(prev => [...prev, newVersion]);
    setCurrentVersion(versions.length);
    setShowAllSongs(false);
    setShowLikeOptions(null);
    setShowDislikeOptions(null);
    showEncouragementMsg('tuneComplete', () => {});
  };

  // V4: Reset current version
  const resetCurrentVersion = () => {
    updateCurrentVersion(v => ({
      ...v,
      tuneLikes: {},
      tuneDislikes: {},
    }));
    setShowLikeOptions(null);
    setShowDislikeOptions(null);
    showToast('当前版本已重置✨，可重新进行优化哦');
  };

  const handleReEvaluateFromPlaylist = () => {
    setSubStage('rules');
    setProgress(0);
    setVersions([]);
    setCurrentVersion(0);
    setPreference({
      dislikedGenres: [], dislikedRhythms: [], dislikedStyles: [],
      likedSongs: [], quizAnswers: {},
    });
  };

  const handleCompleteScene = () => {
    onComplete({ scene, playlist: versions[currentVersion]?.playlist || [] });
  };

  const showEncouragementMsg = (type: keyof typeof ENCOURAGEMENTS, callback: () => void) => {
    const msgs = ENCOURAGEMENTS[type];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    setEncouragement(msg);
    setTimeout(() => {
      setEncouragement(null);
      callback();
    }, 2500);
  };

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

      {/* Like counter (demo stage) */}
      {subStage === 'demo' && (
        <div className="w-full max-w-2xl mb-2 text-center text-xs text-muted-foreground">
          已喜欢：{likeCount}/{MIN_LIKES} 首
          {likeCount >= MIN_LIKES ? (
            <span className="text-primary ml-1">（满足条件，可进入下一步✨）</span>
          ) : (
            <span className="ml-1">（需至少喜欢 {MIN_LIKES} 首才可继续）</span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            {subStage === 'demo' && `Demo 评价中 ${currentDemoIdx + 1}/${demoBatch.length}`}
            {subStage === 'quiz' && `选择题 ${quizIdx + 1}/${quizQuestions.length}`}
            {subStage === 'playlist' && `第${(currentVersion || 0) + 1}版歌单 · 共 ${playlist.length} 首`}
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
          {/* ========== Rules popup ========== */}
          {subStage === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-popover/90 p-8 backdrop-blur-sm text-center"
            >
              <h2 className="mb-4 text-xl font-semibold text-foreground font-serif">听听这些歌，选你喜欢的吧</h2>
              <p className="mb-6 text-sm text-muted-foreground">为了更懂你的 Vibe，帮你生成超精准歌单～</p>
              <div className="mb-6 space-y-3 text-left">
                <div className="flex items-center gap-3 rounded-xl bg-vibe-pink-light p-3">
                  <span className="text-2xl">❤️</span>
                  <div>
                    <span className="text-sm font-medium text-foreground">很喜欢·匹配</span>
                    <p className="text-xs text-muted-foreground">一键确认，直接切下一首</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                  <span className="text-2xl">😕</span>
                  <div>
                    <span className="text-sm font-medium text-foreground">不太满意</span>
                    <p className="text-xs text-muted-foreground">选个原因，帮你避开这类歌</p>
                  </div>
                </div>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">需要至少喜欢 {MIN_LIKES} 首才可继续哦</p>
              <button
                onClick={startDemos}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
              >
                我知道啦
              </button>
            </motion.div>
          )}

          {/* ========== Demo display ========== */}
          {subStage === 'demo' && currentDemo && (
            <motion.div
              key={`demo-${currentDemoIdx}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-6">
                {/* Like button (left) */}
                <button
                  onClick={handleLike}
                  className="group flex flex-col items-center gap-1"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl transition-all group-hover:scale-110 ${
                    likedInDemo.has(`${currentDemo.name}-${currentDemo.artist}`)
                      ? 'border-primary bg-vibe-pink-light'
                      : 'border-primary/30 bg-card group-hover:border-primary group-hover:bg-vibe-pink-light'
                  }`}>
                    {likedInDemo.has(`${currentDemo.name}-${currentDemo.artist}`) ? '❤️' : '🤍'}
                  </div>
                  <span className="text-[10px] text-muted-foreground">很喜欢·匹配</span>
                </button>

                {/* Album card */}
                <div className="relative">
                  {(() => {
                    const info = getInfo(currentDemo.name, currentDemo.artist);
                    return (
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="flex h-48 w-48 items-center justify-center rounded-2xl text-5xl font-serif text-white/80 select-none shadow-lg overflow-hidden"
                        style={info.coverUrl ? {} : { background: getAlbumGradient(currentDemo.name) }}
                      >
                        {info.coverUrl ? (
                          <img src={info.coverUrl} alt={currentDemo.name} className="h-full w-full object-cover" />
                        ) : info.loading ? (
                          <div className="animate-pulse text-3xl">🎵</div>
                        ) : (
                          currentDemo.name.charAt(0)
                        )}
                      </motion.div>
                    );
                  })()}
                  {showHeartAnim && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <motion.span
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className="text-6xl"
                      >💕</motion.span>
                    </div>
                  )}
                </div>

                {/* Dislike button (right) */}
                <button
                  onClick={handleDislike}
                  className="group flex flex-col items-center gap-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-card text-xl transition-all group-hover:scale-110 group-hover:border-muted-foreground group-hover:bg-secondary">
                    😕
                  </div>
                  <span className="text-[10px] text-muted-foreground">不太满意</span>
                </button>
              </div>

              <h3 className="mt-6 text-xl font-medium text-foreground">{currentDemo.name}</h3>
              <p className="mt-1 text-muted-foreground">{currentDemo.artist}</p>
              {/* Audio preview */}
              <div className="mt-2">
                <MiniPlayer previewUrl={getInfo(currentDemo.name, currentDemo.artist).previewUrl} songName={currentDemo.name} />
              </div>

              {/* Undo like hint */}
              {canUndoLike && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={handleUndoLike}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  3秒内可取消喜欢
                </motion.button>
              )}

              {/* ===== Dislike popup ===== */}
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
                      <button
                        onClick={() => { setShowDislikePopup(false); setDislikeCategory(null); setShowFollowUp(false); }}
                        className="mb-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← 返回上一步
                      </button>

                      {!dislikeCategory && !showFollowUp ? (
                        <>
                          <p className="mb-4 text-center text-sm text-foreground">告诉我哪里不对味？</p>
                          <div className="space-y-2">
                            {(Object.entries(DISLIKE_REASONS) as [('type' | 'rhythm' | 'style'), typeof DISLIKE_REASONS.type][]).map(([key, val]) => (
                              <button
                                key={key}
                                onClick={() => handleDislikeCategory(key)}
                                className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left text-sm text-foreground hover:bg-secondary transition-colors"
                              >
                                <span className="text-xl mt-0.5">{val.icon}</span>
                                <div>
                                  <span className="font-medium">{val.label}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">{val.explanation}</p>
                                  {val.example && <p className="text-xs text-muted-foreground/70 mt-0.5">例：{val.example}</p>}
                                </div>
                              </button>
                            ))}
                          </div>
                          <p className="mt-3 text-center text-xs text-muted-foreground">选一个原因，我会更懂你哦</p>
                        </>
                      ) : showFollowUp ? (
                        <>
                          <p className="mb-4 text-center text-sm text-foreground">
                            你是不喜欢「{scene.name}」场景下的{dislikeDetail?.replace('太 ', '').replace('太', '')}类歌曲吗？
                          </p>
                          <p className="mb-4 text-center text-xs text-muted-foreground">
                            即询问是否不喜欢{scene.name}场景下的所有该类歌曲
                          </p>
                          <div className="flex gap-3 justify-center">
                            <button
                              onClick={() => handleFollowUpAnswer(true)}
                              className="rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-vibe-pink-hover"
                            >
                              是
                            </button>
                            <button
                              onClick={() => handleFollowUpAnswer(false)}
                              className="rounded-xl border border-border bg-card px-6 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                            >
                              否
                            </button>
                          </div>
                        </>
                      ) : dislikeCategory ? (
                        <>
                          <p className="mb-4 text-center text-sm text-foreground">
                            {DISLIKE_REASONS[dislikeCategory].icon} 具体是哪里不对？
                          </p>
                          <div className="space-y-2">
                            {DISLIKE_REASONS[dislikeCategory].details.map((d) => (
                              <button
                                key={d.label}
                                onClick={() => handleDislikeDetail(d.label)}
                                className="flex w-full flex-col rounded-xl border border-border bg-card p-3 text-left text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors group"
                              >
                                <span className="font-medium">{d.label}</span>
                                {d.explanation && <span className="text-xs text-muted-foreground group-hover:text-primary-foreground/80 mt-0.5">{d.explanation}</span>}
                                {d.example && <span className="text-xs text-muted-foreground/70 group-hover:text-primary-foreground/60 mt-0.5">例：{d.example}</span>}
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
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ========== Need more likes popup ========== */}
          {showNeedMoreLikes && (
            <motion.div
              key="need-likes"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-popover/90 p-8 backdrop-blur-sm text-center"
            >
              <p className="text-lg text-foreground mb-4">
                {reEvalCount >= 3
                  ? '宝～看来当前 Demo 里喜欢的不多呀🥺，点击【重新评价】再试试，选 4 首你喜欢的，歌单会更贴合你的 Vibe 哦'
                  : '宝～为了给你生成更精准的歌单，需要至少喜欢 4 首 Demo 哦🥺，点击【重新评价】，可以重新选择喜欢的歌曲呀'}
              </p>
              <button
                onClick={handleReEvaluate}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
              >
                重新评价
              </button>
            </motion.div>
          )}

          {/* ========== Quiz ========== */}
          {subStage === 'quiz' && currentQuiz && (
            <motion.div
              key={`quiz-${quizIdx}-${currentQuiz.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-md"
            >
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">
                    问题 {quizIdx + 1} / {quizQuestions.length}
                    <span className="ml-2 text-primary/70">
                      {currentQuiz.type === 'preference' ? '偏好题' : '实证题'}
                    </span>
                  </p>
                  <span className="text-xs text-muted-foreground">可多选</span>
                </div>
                <h3 className="mb-6 text-lg font-medium text-foreground">{currentQuiz.question}</h3>
                
                {currentQuiz.type === 'empirical' && (
                  <p className="mb-4 text-xs text-muted-foreground">均为 Demo 外、来自你歌单的歌曲</p>
                )}

                <div className="space-y-2">
                  {currentQuiz.options.map((opt) => {
                    const selected = quizSelections[currentQuiz.id]?.has(opt.label);
                    const songRef = opt.songRef;
                    const songParts = songRef ? songRef.split('-') : null;
                    const songInfo = songParts ? getInfo(songParts[0], songParts.slice(1).join('-')) : null;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => toggleQuizOption(currentQuiz.id, opt.label)}
                        className={`w-full rounded-xl border p-3 text-left text-sm transition-all flex items-center gap-3 ${
                          selected
                            ? 'border-primary bg-vibe-pink-light text-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/50'
                        }`}
                      >
                        {songInfo?.coverUrl && (
                          <img src={songInfo.coverUrl} alt="" className="h-10 w-10 rounded-lg shrink-0 object-cover" />
                        )}
                        <span className="flex-1">{opt.label}</span>
                        {songInfo?.previewUrl && (
                          <MiniPlayer previewUrl={songInfo.previewUrl} songName={opt.label} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div className="flex gap-2">
                    {quizIdx > 0 && (
                      <button
                        onClick={() => setQuizIdx(prev => prev - 1)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← 上一题
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSwapQuestion}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      这题不太合适，换一道
                    </button>
                    <button
                      onClick={handleQuizNext}
                      disabled={!quizSelections[currentQuiz.id]?.size}
                      className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {quizIdx === quizQuestions.length - 1 ? '完成' : '下一题'}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {swapToast && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-3 text-center text-xs text-muted-foreground"
                    >
                      {swapToast}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ========== Playlist with version system ========== */}
          {subStage === 'playlist' && currentVersionData && (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg"
            >
              {/* Version header */}
              <div className="mb-4 text-center">
                <span className="text-3xl">{scene.icon}</span>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {scene.name} · 共 {playlist.length} 首
                </h2>

                {/* Version tabs */}
                {versions.length > 1 && (
                  <div className="mt-3 flex justify-center gap-2">
                    {versions.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => { setCurrentVersion(i); setShowAllSongs(false); setShowLikeOptions(null); setShowDislikeOptions(null); }}
                        className={`rounded-lg px-3 py-1 text-xs transition-all ${
                          i === currentVersion
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                        }`}
                      >
                        第{v.version}版
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-2 text-xs text-muted-foreground">
                  {versions.length === 1
                    ? '第一版歌单来啦🥰，歌单不限量，点击歌曲右侧按钮可优化所有贴合歌曲哦'
                    : `第${currentVersionData.version}版歌单`}
                </p>
                {versions.length < MAX_TUNE_ROUNDS && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    ❤️ 喜欢（想要更多同风格/同歌手）&nbsp;&nbsp;✕ 不喜欢（仅这首/同风格）
                  </p>
                )}
              </div>

              {/* Song list */}
              <div className="space-y-2">
                {displayedPlaylist.map((song, i) => {
                  const key = `${song.name}-${song.artist}`;
                  const isLiked = !!tuneLikes[key];
                  const isDisliked = tuneDislikes[key] !== undefined && tuneDislikes[key] !== null;
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`relative rounded-xl border p-3 transition-colors ${
                        isLiked
                          ? 'border-primary bg-vibe-pink-light'
                          : isDisliked
                          ? 'border-destructive/30 bg-destructive/5 opacity-60'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {(() => {
                          const info = i < 10 ? getInfo(song.name, song.artist) : null;
                          return info?.coverUrl ? (
                            <img src={info.coverUrl} alt={song.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-serif text-white/80"
                              style={{ background: getAlbumGradient(song.name) }}
                            >
                              {song.name.charAt(0)}
                            </div>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{song.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                        </div>
                        {i < 10 && (
                          <MiniPlayer previewUrl={getInfo(song.name, song.artist).previewUrl} songName={song.name} />
                        )}
                        {versions.length <= MAX_TUNE_ROUNDS && (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => toggleLike(key)}
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                                isLiked
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                              }`}
                            >
                              ❤️
                            </button>
                            <button
                              onClick={() => toggleDislike(key)}
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                                isDisliked
                                  ? 'bg-muted-foreground/30 text-foreground'
                                  : 'bg-secondary text-muted-foreground hover:bg-destructive/20'
                              }`}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Like sub-options */}
                      <AnimatePresence>
                        {showLikeOptions === key && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 flex flex-wrap items-center gap-2 overflow-hidden"
                          >
                            <button
                              onClick={() => setLikeOption(key, 'sameStyle')}
                              className={`rounded-lg px-3 py-1 text-xs transition-all ${
                                tuneLikes[key]?.sameStyle
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                              }`}
                            >
                              想要更多同风格
                            </button>
                            <button
                              onClick={() => setLikeOption(key, 'sameArtist')}
                              className={`rounded-lg px-3 py-1 text-xs transition-all ${
                                tuneLikes[key]?.sameArtist
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                              }`}
                            >
                              想要更多同歌手
                            </button>
                            <button
                              onClick={confirmLikeOptions}
                              className="text-xs text-primary hover:underline"
                            >
                              确认
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Dislike sub-options */}
                      <AnimatePresence>
                        {showDislikeOptions === key && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 flex flex-wrap items-center gap-2 overflow-hidden"
                          >
                            <button
                              onClick={() => setDislikeOption(key, 'single')}
                              className="rounded-lg bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-destructive/20 transition-all"
                            >
                              仅不喜欢这一首
                            </button>
                            <button
                              onClick={() => setDislikeOption(key, 'style')}
                              className="rounded-lg bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-destructive/20 transition-all"
                            >
                              不喜欢这种风格（全部剔除）
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              {/* Show more / less */}
              {playlist.length > 10 && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setShowAllSongs(prev => !prev)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAllSongs ? '收起' : `更多（共 ${playlist.length} 首）`}
                  </button>
                  {!showAllSongs && (
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      歌单不限量，所有贴合你偏好的歌曲均已生成✨
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {versions.length < MAX_TUNE_ROUNDS && hasTuneFeedback && (
                  <button
                    onClick={applyTuning}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
                  >
                    生成第{versions.length + 1}版歌单
                  </button>
                )}
                {versions.length >= MAX_TUNE_ROUNDS && hasTuneFeedback && (
                  <p className="text-xs text-muted-foreground">宝～已为你优化 {MAX_TUNE_ROUNDS} 轮啦🥰，当前歌单已最贴合你的偏好，可直接导出使用哦</p>
                )}
                <button
                  onClick={resetCurrentVersion}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  重置当前版本
                </button>
                <button
                  onClick={handleReEvaluateFromPlaylist}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  重新评价
                </button>
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

      {/* Action toast */}
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2"
          >
            <div className="rounded-xl border border-border bg-popover/95 px-5 py-2.5 text-sm text-foreground shadow-lg backdrop-blur-sm">
              {actionToast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
