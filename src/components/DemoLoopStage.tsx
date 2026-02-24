import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type Song,
  type Scene,
  type UserPreference,
  type QuizQuestion,
  selectDemoSongs,
  generatePlaylist,
  generateQuizQuestions,
  getSwapPreferenceQuestion,
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
const MIN_LIKES = 4;

export default function DemoLoopStage({
  songs, scene, sceneIndex, totalScenes, usedSongs,
  onComplete, onBackToScenes, onRestart,
}: DemoLoopStageProps) {
  const [subStage, setSubStage] = useState<SubStage>('rules');
  const [demoSongs, setDemoSongs] = useState<Song[]>([]);
  const [currentDemoIdx, setCurrentDemoIdx] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
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

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelections, setQuizSelections] = useState<Record<string, Set<string>>>({});
  const [usedPrefIds, setUsedPrefIds] = useState<Set<string>>(new Set());
  const [swapToast, setSwapToast] = useState<string | null>(null);

  // Playlist state
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [tuneRound, setTuneRound] = useState(0);
  const [tuneLikes, setTuneLikes] = useState<Record<string, { sameStyle: boolean; sameArtist: boolean }>>({});
  const [tuneDislikes, setTuneDislikes] = useState<Record<string, 'single' | 'style' | null>>({});
  const [showLikeOptions, setShowLikeOptions] = useState<string | null>(null);
  const [showDislikeOptions, setShowDislikeOptions] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);

  // Demo song keys for quiz exclusion
  const demoKeys = useMemo(() => new Set(demoSongs.map(s => `${s.name}-${s.artist}`)), [demoSongs]);

  // Initialize demos
  const startDemos = useCallback(() => {
    const demos = selectDemoSongs(songs, scene, usedSongs);
    setDemoSongs(demos);
    setCurrentDemoIdx(0);
    setLikeCount(0);
    setSubStage('demo');
    setProgress(20);
  }, [songs, scene, usedSongs]);

  // ========== Demo handlers ==========
  const handleLike = () => {
    const song = demoSongs[currentDemoIdx];
    if (song) {
      setPreference(prev => ({ ...prev, likedSongs: [...prev.likedSongs, song] }));
      setLikeCount(prev => prev + 1);
    }
    setShowHeartAnim(true);
    setTimeout(() => {
      setShowHeartAnim(false);
      advanceDemo();
    }, 800);
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
    if (currentDemoIdx < 3) {
      setCurrentDemoIdx(prev => prev + 1);
    } else {
      // All 4 demos done - check like count
      if (likeCount + 1 >= MIN_LIKES || (likeCount >= MIN_LIKES)) {
        setProgress(50);
        showEncouragementMsg('demoComplete', () => {
          // Generate quiz questions
          const qs = generateQuizQuestions(songs, scene, demoKeys, usedSongs);
          setQuizQuestions(qs);
          setQuizIdx(0);
          setQuizSelections({});
          setSubStage('quiz');
        });
      } else {
        // Need more likes
        setShowNeedMoreLikes(true);
      }
    }
  };

  const handleReEvaluate = () => {
    setShowNeedMoreLikes(false);
    setReEvalCount(prev => prev + 1);
    setCurrentDemoIdx(0);
    setLikeCount(0);
    setPreference(prev => ({ ...prev, likedSongs: [] }));
    setProgress(20);
  };

  // ========== Quiz handlers ==========
  const currentQuiz = quizQuestions[quizIdx];

  const toggleQuizOption = (questionId: string, option: string) => {
    setQuizSelections(prev => {
      const current = new Set(prev[questionId] || []);
      if (current.has(option)) {
        current.delete(option);
      } else {
        current.add(option);
      }
      return { ...prev, [questionId]: current };
    });
  };

  const handleQuizNext = () => {
    // Save current answer
    const sel = quizSelections[currentQuiz.id];
    if (sel && sel.size > 0) {
      setPreference(prev => ({
        ...prev,
        quizAnswers: { ...prev.quizAnswers, [currentQuiz.id]: Array.from(sel) },
      }));
    }

    if (quizIdx < quizQuestions.length - 1) {
      setQuizIdx(prev => prev + 1);
    } else {
      // Quiz done
      setProgress(80);
      showEncouragementMsg('quizComplete', () => {
        const pl = generatePlaylist(songs, scene, preference, usedSongs, demoKeys);
        setPlaylist(pl);
        setTuneRound(0);
        resetTuneFeedback();
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

  // ========== Playlist tune handlers ==========
  const resetTuneFeedback = () => {
    setTuneLikes({});
    setTuneDislikes({});
    setShowLikeOptions(null);
    setShowDislikeOptions(null);
    setShowAllSongs(false);
  };

  const toggleLike = (key: string) => {
    if (tuneLikes[key]) {
      setTuneLikes(prev => { const n = { ...prev }; delete n[key]; return n; });
      setShowLikeOptions(null);
    } else {
      // Remove dislike if any
      setTuneDislikes(prev => { const n = { ...prev }; delete n[key]; return n; });
      setShowDislikeOptions(null);
      setTuneLikes(prev => ({ ...prev, [key]: { sameStyle: false, sameArtist: false } }));
      setShowLikeOptions(key);
    }
  };

  const setLikeOption = (key: string, option: 'sameStyle' | 'sameArtist') => {
    setTuneLikes(prev => ({
      ...prev,
      [key]: { ...prev[key], [option]: !prev[key]?.[option] },
    }));
  };

  const confirmLikeOptions = () => setShowLikeOptions(null);

  const toggleDislike = (key: string) => {
    if (tuneDislikes[key]) {
      setTuneDislikes(prev => { const n = { ...prev }; delete n[key]; return n; });
      setShowDislikeOptions(null);
    } else {
      // Remove like if any
      setTuneLikes(prev => { const n = { ...prev }; delete n[key]; return n; });
      setShowLikeOptions(null);
      setTuneDislikes(prev => ({ ...prev, [key]: null }));
      setShowDislikeOptions(key);
    }
  };

  const setDislikeOption = (key: string, option: 'single' | 'style') => {
    setTuneDislikes(prev => ({ ...prev, [key]: option }));
    setShowDislikeOptions(null);
  };

  const hasTuneFeedback = Object.keys(tuneLikes).length > 0 || Object.values(tuneDislikes).some(v => v !== null);

  const applyTuning = () => {
    if (!hasTuneFeedback) return;

    const dislikedKeys = new Set(
      Object.entries(tuneDislikes).filter(([, v]) => v !== null).map(([k]) => k)
    );

    // Keep songs not disliked
    const kept = playlist.filter(s => !dislikedKeys.has(`${s.name}-${s.artist}`));

    const usedKeys = new Set([
      ...Array.from(usedSongs),
      ...kept.map(s => `${s.name}-${s.artist}`),
    ]);

    // Fill replacements
    const remaining = songs.filter(s => !usedKeys.has(`${s.name}-${s.artist}`));
    const needed = Math.max(0, playlist.length - kept.length);
    const replacements = remaining.slice(0, needed);

    const newPlaylist = [...kept, ...replacements];
    setPlaylist(newPlaylist);
    setTuneRound(prev => prev + 1);
    resetTuneFeedback();
    showEncouragementMsg('tuneComplete', () => {});
  };

  const handleReEvaluateFromPlaylist = () => {
    setSubStage('rules');
    setProgress(0);
    setPreference({
      dislikedGenres: [], dislikedRhythms: [], dislikedStyles: [],
      likedSongs: [], quizAnswers: {},
    });
  };

  const handleCompleteScene = () => {
    onComplete({ scene, playlist });
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

  const currentDemo = demoSongs[currentDemoIdx];
  const displayedPlaylist = showAllSongs ? playlist : playlist.slice(0, 10);

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
          {likeCount >= MIN_LIKES && <span className="text-primary ml-1">（满足条件，可进入下一步✨）</span>}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            {subStage === 'demo' && `Demo 评价中 ${currentDemoIdx + 1}/4`}
            {subStage === 'quiz' && `选择题 ${quizIdx + 1}/${quizQuestions.length}`}
            {subStage === 'playlist' && (tuneRound > 0 ? `第${tuneRound + 1}版歌单 · 共 ${playlist.length} 首` : `第一版歌单 · 共 ${playlist.length} 首`)}
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
              <p className="mb-6 text-lg text-foreground">为了更懂你的 Vibe，帮你生成超精准歌单～</p>
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

          {/* ========== Demo display with left/right buttons ========== */}
          {subStage === 'demo' && currentDemo && (
            <motion.div
              key={`demo-${currentDemoIdx}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="flex flex-col items-center"
            >
              {/* Demo card with side buttons */}
              <div className="flex items-center gap-6">
                {/* Like button (left) */}
                <button
                  onClick={handleLike}
                  className="group flex flex-col items-center gap-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/30 bg-card text-xl transition-all group-hover:scale-110 group-hover:border-primary group-hover:bg-vibe-pink-light">
                    ❤️
                  </div>
                  <span className="text-[10px] text-muted-foreground">很喜欢·匹配</span>
                </button>

                {/* Album card */}
                <div className="relative">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="flex h-48 w-48 items-center justify-center rounded-2xl text-5xl font-serif text-white/80 select-none shadow-lg"
                    style={{ background: getAlbumGradient(currentDemo.name) }}
                  >
                    {currentDemo.name.charAt(0)}
                  </motion.div>
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
                      {/* Back button */}
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

          {/* ========== Quiz (multi-select + swap) ========== */}
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
                    return (
                      <button
                        key={opt.label}
                        onClick={() => toggleQuizOption(currentQuiz.id, opt.label)}
                        className={`w-full rounded-xl border p-3 text-left text-sm transition-all ${
                          selected
                            ? 'border-primary bg-vibe-pink-light text-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/50'
                        }`}
                      >
                        {opt.label}
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

                {/* Swap toast */}
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

          {/* ========== Playlist (unlimited + like/dislike sub-options) ========== */}
          {subStage === 'playlist' && (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg"
            >
              <div className="mb-4 text-center">
                <span className="text-3xl">{scene.icon}</span>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {scene.name} · 共 {playlist.length} 首
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tuneRound === 0
                    ? '第一版歌单来啦🥰，点击歌曲右侧按钮可优化哦'
                    : `第${tuneRound + 1}版歌单`}
                </p>
                {tuneRound < MAX_TUNE_ROUNDS && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    ❤️ 喜欢（想要更多同风格/同歌手）&nbsp;&nbsp;✕ 不喜欢（仅这首/同风格）
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {displayedPlaylist.map((song, i) => {
                  const key = `${song.name}-${song.artist}`;
                  const isLiked = !!tuneLikes[key];
                  const isDisliked = tuneDislikes[key] !== undefined && tuneDislikes[key] !== null;
                  const isDislikedPending = tuneDislikes[key] === null;
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
                                isDisliked || isDislikedPending
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
                {tuneRound < MAX_TUNE_ROUNDS && hasTuneFeedback && (
                  <button
                    onClick={applyTuning}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
                  >
                    优化歌单
                  </button>
                )}
                <button
                  onClick={handleReEvaluateFromPlaylist}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground hover:bg-secondary transition-colors"
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
    </motion.div>
  );
}
