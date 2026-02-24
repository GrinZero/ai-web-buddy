// VibeList 纯前端歌单匹配引擎

export interface Song {
  name: string;
  artist: string;
  raw: string;
}

export interface Scene {
  id: string;
  name: string;
  icon: string;
  description: string;
  vibeProfile: VibeProfile;
}

export interface VibeProfile {
  genres: string[];
  tempo: 'slow' | 'medium' | 'fast';
  mood: string[];
}

export interface DemoFeedback {
  songIndex: number;
  liked: boolean;
  reason?: {
    category: 'type' | 'rhythm' | 'style';
    detail: string;
    confirmDislike?: boolean;
  };
}

export interface QuizQuestion {
  id: string;
  type: 'preference' | 'empirical';
  question: string;
  options: QuizOption[];
  multiSelect: boolean;
  swappable: boolean;
}

export interface QuizOption {
  label: string;
  songRef?: string;
}

export interface UserPreference {
  dislikedGenres: string[];
  dislikedRhythms: string[];
  dislikedStyles: string[];
  likedSongs: Song[];
  quizAnswers: Record<string, string[]>;
}

// 7 个初始场景
export const SCENES: Scene[] = [
  {
    id: 'morning-commute',
    name: '晨起通勤',
    icon: '🌅',
    description: '轻快、治愈，适配早起出行',
    vibeProfile: { genres: ['流行', '轻音乐', '民谣'], tempo: 'medium', mood: ['治愈', '轻快', '温暖'] },
  },
  {
    id: 'evening-home',
    name: '下班回家',
    icon: '🏠',
    description: '舒缓、放松，适配结束一天工作',
    vibeProfile: { genres: ['R&B', '民谣', '轻音乐'], tempo: 'slow', mood: ['放松', '舒缓', '惬意'] },
  },
  {
    id: 'study-focus',
    name: '学习专注',
    icon: '📖',
    description: '安静、无干扰，适配学习、办公',
    vibeProfile: { genres: ['轻音乐', '电子乐', '古典'], tempo: 'slow', mood: ['专注', '平静', '安静'] },
  },
  {
    id: 'workout',
    name: '运动健身',
    icon: '💪',
    description: '有律动、有活力，适配运动状态',
    vibeProfile: { genres: ['电子乐', '说唱', '流行'], tempo: 'fast', mood: ['活力', '激情', '律动'] },
  },
  {
    id: 'sleep',
    name: '睡前放松',
    icon: '🌙',
    description: '轻柔、舒缓，适配睡前氛围',
    vibeProfile: { genres: ['轻音乐', '民谣', '古典'], tempo: 'slow', mood: ['安静', '温柔', '舒缓'] },
  },
  {
    id: 'chill-home',
    name: '宅家治愈',
    icon: '🧸',
    description: '温柔、惬意，适配宅家休闲',
    vibeProfile: { genres: ['流行', '民谣', 'R&B'], tempo: 'medium', mood: ['治愈', '温暖', '惬意'] },
  },
  {
    id: 'driving',
    name: '出行自驾',
    icon: '🚗',
    description: '轻快、有节奏，适配自驾场景',
    vibeProfile: { genres: ['流行', '摇滚', '电子乐'], tempo: 'fast', mood: ['轻快', '自由', '畅快'] },
  },
];

// 示例歌曲
export const EXAMPLE_SONGS = `七里香 - 周杰伦
晴天 - 周杰伦
小幸运 - 田馥甄
起风了 - 买辣椒也用券
平凡之路 - 朴树
光年之外 - 邓紫棋
后来 - 刘若英
夜曲 - 周杰伦
遇见 - 孙燕姿
稻香 - 周杰伦
告白气球 - 周杰伦
红豆 - 王菲
匆匆那年 - 王菲
安静 - 周杰伦
岁月神偷 - 金玟岐
追光者 - 岑宁儿
体面 - 于文文
说散就散 - 袁娅维
不将就 - 李荣浩
像鱼 - 王贰浪`;

// 解析歌曲文本
export function parseSongs(text: string): Song[] {
  const lines = text.split('\n');
  const songs: Song[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.includes('-') && !trimmed.includes('–') && !trimmed.includes('—')) continue;

    const separator = trimmed.includes(' - ') ? ' - ' : trimmed.includes(' – ') ? ' – ' : trimmed.includes(' — ') ? ' — ' : null;
    if (!separator) {
      const dashIdx = trimmed.indexOf('-');
      if (dashIdx <= 0 || dashIdx >= trimmed.length - 1) continue;
      const name = trimmed.substring(0, dashIdx).trim();
      const artist = trimmed.substring(dashIdx + 1).trim();
      if (!name || !artist) continue;
      const key = `${name}-${artist}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push({ name, artist, raw: trimmed });
    } else {
      const parts = trimmed.split(separator);
      if (parts.length < 2) continue;
      const name = parts[0].trim();
      const artist = parts.slice(1).join(separator).trim();
      if (!name || !artist) continue;
      const key = `${name}-${artist}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push({ name, artist, raw: trimmed });
    }
  }

  return songs;
}

// 简单哈希函数用于伪随机
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// V4: 一次性预生成≥12首Demo备选池
export function selectDemoPool(songs: Song[], scene: Scene, usedSongs: Set<string>): Song[] {
  const available = songs.filter(s => !usedSongs.has(`${s.name}-${s.artist}`));
  const sorted = [...available].sort((a, b) => {
    const hashA = simpleHash(a.name + scene.id + 'demo-pool');
    const hashB = simpleHash(b.name + scene.id + 'demo-pool');
    return hashA - hashB;
  });
  // 至少12首，不足则全部返回
  return sorted.slice(0, Math.max(12, Math.min(available.length, 16)));
}

// V4: 从Demo池中随机抽取一批展示（每次不重复）
export function selectDemoBatch(pool: Song[], alreadyShown: Set<string>, batchSize: number = 4): Song[] {
  const available = pool.filter(s => !alreadyShown.has(`${s.name}-${s.artist}`));
  // Shuffle deterministically but differently each time
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(batchSize, available.length));
}

// 保留旧接口兼容
export function selectDemoSongs(songs: Song[], scene: Scene, usedSongs: Set<string>): Song[] {
  return selectDemoPool(songs, scene, usedSongs).slice(0, 4);
}

// 根据偏好生成最终歌单（不限量）
// V4 fix: 实际使用 UserPreference 进行过滤 + 版本优化不全量去重
export function generatePlaylist(
  songs: Song[],
  scene: Scene,
  preference: UserPreference,
  usedInOtherScenes: Set<string>,
  demoSongKeys: Set<string> = new Set(),
  dislikedSongKeys: Set<string> = new Set() // V4: 仅排除被❌的歌曲
): Song[] {
  // Start with liked songs from demo (always included first)
  const liked = preference.likedSongs.filter(s => !usedInOtherScenes.has(`${s.name}-${s.artist}`));
  const likedKeys = new Set(liked.map(s => `${s.name}-${s.artist}`));

  // Get remaining songs, excluding used & disliked
  const remaining = songs.filter(s => {
    const key = `${s.name}-${s.artist}`;
    if (usedInOtherScenes.has(key)) return false;
    if (dislikedSongKeys.has(key)) return false;
    if (likedKeys.has(key)) return false;
    return true;
  });

  // V4 fix: Build sets of empirical quiz song keys for scoring
  const empiricalLikedKeys = new Set<string>();
  const empiricalShownKeys = new Set<string>();
  for (const [qId, selections] of Object.entries(preference.quizAnswers)) {
    if (qId.startsWith('empirical')) {
      // selections are labels like "songName - artist", extract songRef
      for (const sel of selections) {
        // Parse "name - artist" format back to key
        const sepIdx = sel.indexOf(' - ');
        if (sepIdx > 0) {
          const key = `${sel.substring(0, sepIdx)}-${sel.substring(sepIdx + 3)}`;
          empiricalLikedKeys.add(key);
          empiricalShownKeys.add(key);
        }
      }
    }
  }
  // We need all empirical options (shown but maybe not selected) — approximate from songs pool
  // Since we can't access quiz questions here, empiricalShownKeys only has selected ones
  // We'll use demoSongKeys to identify demo songs for exclusion awareness

  // Parse preference quiz signals for penalty keywords
  const penaltyKeywords: string[] = [];
  for (const [qId, selections] of Object.entries(preference.quizAnswers)) {
    if (!qId.startsWith('pref')) continue;
    for (const sel of selections) {
      const lower = sel.toLowerCase();
      // "完全不接受" or "不太接受" rap → penalize rap-related
      if (lower.includes('不接受') && lower.includes('说唱') || lower === '完全不接受' || lower === '不太接受') {
        penaltyKeywords.push('说唱', 'rap', 'hip-hop', 'hiphop');
      }
      if (lower.includes('不接受高强度')) {
        penaltyKeywords.push('摇滚', 'rock', 'metal', 'punk');
      }
    }
  }

  // V4: Apply preference-based scoring
  const scored = remaining.map(s => {
    let score = 0;
    const key = `${s.name}-${s.artist}`;
    const nameArtist = `${s.name} ${s.artist}`.toLowerCase();

    // Penalize disliked genres/styles/rhythms from demo feedback
    for (const g of preference.dislikedGenres) {
      if (nameArtist.includes(g.replace(/^太\s*/, '').toLowerCase())) score -= 10;
    }
    for (const r of preference.dislikedRhythms) {
      if (nameArtist.includes(r.replace(/^太\s*/, '').toLowerCase())) score -= 10;
    }
    for (const st of preference.dislikedStyles) {
      if (nameArtist.includes(st.replace(/^太\s*/, '').toLowerCase())) score -= 10;
    }

    // Boost songs liked in empirical quiz
    if (empiricalLikedKeys.has(key)) score += 5;

    // Penalize by preference quiz keywords
    for (const kw of penaltyKeywords) {
      if (nameArtist.includes(kw)) score -= 8;
    }

    // Scene affinity hash for deterministic ordering within same score
    const hash = simpleHash(s.name + scene.id + 'final' + dislikedSongKeys.size);
    return { song: s, score, hash };
  });

  // Sort: higher score first, then by hash for same score
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.hash - b.hash;
  });

  // V4 fix: Only return songs with score >= cutoff (filter out heavily penalized)
  const cutoff = -15;
  const filtered = scored.filter(s => s.score > cutoff);

  return [...liked, ...filtered.map(s => s.song)];
}

// ========== 选择题系统（V4 重构） ==========

// 偏好题题库（核心4题 + 备用题，V4：全部出4题，支持换题）
const PREFERENCE_QUESTIONS: Omit<QuizQuestion, 'id'>[] = [
  {
    type: 'preference',
    question: '当前场景下，你更偏爱哪种感觉的歌曲？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '轻快不费脑' },
      { label: '舒缓治愈' },
      { label: '有轻微律动' },
      { label: '温柔抒情' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你能接受歌曲里有哪种"特别声音"？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '钢琴声' },
      { label: '吉他声' },
      { label: '电子合成器声' },
      { label: '无特别乐器，纯人声为主' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你偏爱歌曲的演唱风格是？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '轻柔女声' },
      { label: '温柔男声' },
      { label: '合唱/和声' },
      { label: '无所谓，旋律好听即可' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你能接受歌曲的情绪强度是？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '低强度（平缓、安静）' },
      { label: '中强度（有情绪但不激烈）' },
      { label: '较高强度（情绪饱满不炸耳）' },
      { label: '不接受高强度' },
    ],
  },
  // 备用题 (V4: 9个备用题)
  {
    type: 'preference',
    question: '当前场景下，你偏爱歌曲的时长是？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '短时长（3分钟以内）' },
      { label: '中等时长（3-4分钟）' },
      { label: '较长时长（4分钟以上）' },
      { label: '无所谓，好听就行' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你更偏爱哪种歌词风格？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '直白易懂' },
      { label: '文艺细腻' },
      { label: '简洁轻快' },
      { label: '无所谓，旋律大于歌词' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你能接受歌曲里有说唱片段吗？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '完全接受' },
      { label: '偶尔接受' },
      { label: '不太接受' },
      { label: '完全不接受' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你偏爱歌曲的编曲风格是？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '简约编曲（突出旋律）' },
      { label: '丰富编曲（多种乐器）' },
      { label: '清新编曲（轻快简单）' },
      { label: '复古编曲（有年代感）' },
    ],
  },
  {
    type: 'preference',
    question: '当前场景下，你更偏爱新歌还是老歌？',
    multiSelect: true,
    swappable: true,
    options: [
      { label: '偏爱新歌（近1-2年）' },
      { label: '偏爱老歌（经典怀旧）' },
      { label: '都可以' },
      { label: '偏向经典老歌' },
    ],
  },
];

// 实证题模板
const EMPIRICAL_TEMPLATES = [
  '当前场景下，你更喜欢以下哪几首歌曲？',
  '当前场景下，你觉得以下哪几首歌曲更贴合你的 Vibe？',
  '当前场景下，你愿意在专属歌单中听到以下哪几首歌曲？',
  '当前场景下，以下哪几首歌曲的风格更符合你的偏好？',
  '当前场景下，你更想听到以下哪几首歌曲？',
  '当前场景下，你觉得以下哪几首更适配这个场景？',
];

// 生成实证题（V4: 4-6题）
function generateEmpiricalQuestions(
  songs: Song[],
  demoKeys: Set<string>,
  usedSongs: Set<string>,
  scene: Scene,
  count: number
): QuizQuestion[] {
  const available = songs.filter(s => {
    const key = `${s.name}-${s.artist}`;
    return !demoKeys.has(key) && !usedSongs.has(key);
  });

  const shuffled = [...available].sort((a, b) => {
    const hashA = simpleHash(a.name + scene.id + 'empirical');
    const hashB = simpleHash(b.name + scene.id + 'empirical');
    return hashA - hashB;
  });

  const questions: QuizQuestion[] = [];
  let songIdx = 0;

  for (let i = 0; i < count && songIdx < shuffled.length; i++) {
    const optionCount = 3 + (i % 2); // 3-4 options per question
    const questionSongs = shuffled.slice(songIdx, songIdx + optionCount);
    songIdx += optionCount;

    if (questionSongs.length < 2) break;

    questions.push({
      id: `empirical-${i}`,
      type: 'empirical',
      question: EMPIRICAL_TEMPLATES[i % EMPIRICAL_TEMPLATES.length],
      multiSelect: true,
      swappable: false,
      options: questionSongs.map(s => ({
        label: `${s.name} - ${s.artist}`,
        songRef: `${s.name}-${s.artist}`,
      })),
    });
  }

  return questions;
}

// V4: 生成自适应选择题（偏好题4题 + 实证题4-6题）
export function generateQuizQuestions(
  songs: Song[],
  scene: Scene,
  demoKeys: Set<string>,
  usedSongs: Set<string>
): QuizQuestion[] {
  const songCount = songs.length;

  // V4: 实证题数量按歌单复杂度
  let empiricalCount = 4; // 简单歌单
  if (songCount >= 200 && songCount < 500) empiricalCount = 5; // 中等
  if (songCount >= 500) empiricalCount = 6; // 复杂

  // V4: 偏好题固定4题（从前4题中选取，支持换题从备用中替换）
  const prefQuestions: QuizQuestion[] = [];
  const baseHash = simpleHash(scene.id + 'pref-order');
  // 选前4题，但做一定排列变化
  const indices = [0, 1, 2, 3].sort((a, b) => {
    return simpleHash(`${a}-${scene.id}-${baseHash}`) - simpleHash(`${b}-${scene.id}-${baseHash}`);
  });
  for (let i = 0; i < 4; i++) {
    prefQuestions.push({
      ...PREFERENCE_QUESTIONS[indices[i]],
      id: `pref-${i}`,
    });
  }

  // 实证题
  const empiricalQuestions = generateEmpiricalQuestions(songs, demoKeys, usedSongs, scene, empiricalCount);

  // V4: 先偏好题后实证题
  return [...prefQuestions, ...empiricalQuestions];
}

// 获取备用偏好题（换题用）
export function getSwapPreferenceQuestion(currentId: string, usedIds: Set<string>): QuizQuestion | null {
  // 从备用题（index 4+）中找未使用的
  for (let i = 4; i < PREFERENCE_QUESTIONS.length; i++) {
    const id = `pref-swap-${i}`;
    if (id === currentId || usedIds.has(id)) continue;
    return { ...PREFERENCE_QUESTIONS[i], id };
  }
  // 也从前4题中找未使用的
  for (let i = 0; i < PREFERENCE_QUESTIONS.length; i++) {
    const id = `pref-swap-all-${i}`;
    if (id === currentId || usedIds.has(id)) continue;
    return { ...PREFERENCE_QUESTIONS[i], id };
  }
  return null;
}

// 不喜欢原因选项
export interface DislikeDetail {
  label: string;
  explanation: string;
  example: string;
}

export interface DislikeCategory {
  label: string;
  icon: string;
  explanation: string;
  example: string;
  details: DislikeDetail[];
  hasFollowUp: boolean;
}

export const DISLIKE_REASONS: Record<'type' | 'rhythm' | 'style', DislikeCategory> = {
  type: {
    label: '类型不对味',
    icon: '🎵',
    explanation: '歌曲的曲风/类型不符合你的偏好',
    example: '你想要治愈轻音，这首歌是激烈说唱',
    hasFollowUp: true,
    details: [
      { label: '太 R&B', explanation: 'R&B 曲风太浓，不符合当前场景', example: '通勤场景想要轻快流行，这首歌 R&B 节奏太拖沓' },
      { label: '太说唱', explanation: '说唱片段过多，不贴合偏好', example: '睡前场景想要安静歌曲，这首歌全程说唱太吵' },
      { label: '太流行', explanation: '流行感太强，过于大众化', example: '宅家场景想要小众旋律，这首歌是热门流行曲太洗脑' },
      { label: '太国风', explanation: '国风元素太浓，不符合预期', example: '健身场景想要有活力歌曲，这首歌国风旋律太舒缓' },
      { label: '太电子', explanation: '电子合成器声音太突出', example: '学习场景想要无干扰歌曲，这首歌电子音效太突兀' },
      { label: '曲风不符', explanation: '以上都不是，可自行说明曲风问题', example: '' },
    ],
  },
  rhythm: {
    label: '节奏不得劲',
    icon: '🥁',
    explanation: '歌曲的鼓点/节奏不贴合场景',
    example: '学习场景想要舒缓节奏，这首歌鼓点太紧凑',
    hasFollowUp: false,
    details: [
      { label: '鼓点太紧凑', explanation: '鼓点密集，节奏太快', example: '下班场景想要放松，这首歌鼓点太紧凑让人紧张' },
      { label: '鼓点太舒缓', explanation: '鼓点太淡，节奏太慢', example: '健身场景想要有律动，这首歌鼓点太舒缓没活力' },
      { label: '太炸耳', explanation: '节奏太激烈，声音太响', example: '睡前场景想要轻柔，这首歌节奏太炸耳影响放松' },
      { label: '太沉闷', explanation: '节奏拖沓，无起伏', example: '通勤场景想要轻快，这首歌节奏太沉闷让人犯困' },
      { label: '律动不足', explanation: '没有明显节奏起伏，太平淡', example: '自驾场景想要有节奏，这首歌律动不足太单调' },
    ],
  },
  style: {
    label: '风格不戳我',
    icon: '💫',
    explanation: '歌曲的主题/情绪不符合你的预期',
    example: '睡前场景想要轻柔旋律，这首歌太伤感压抑',
    hasFollowUp: false,
    details: [
      { label: '太甜蜜', explanation: '情歌甜度太高，不符合场景', example: '学习场景想要专注，这首歌甜蜜歌词太分心' },
      { label: '太伤感', explanation: '情绪太压抑，太伤感', example: '晨起通勤想要治愈，这首歌伤感情绪太影响心情' },
      { label: '太酷炫', explanation: '风格太张扬，不贴合调性', example: '宅家场景想要温柔，这首歌风格太酷炫太有攻击性' },
      { label: '太温柔', explanation: '过于柔和，缺乏张力', example: '健身场景想要有活力，这首歌太温柔没干劲' },
      { label: '太励志', explanation: '励志感太强，太刻意', example: '睡前场景想要放松，这首歌励志歌词太有压迫感' },
      { label: '风格不符', explanation: '以上都不是，可自行说明风格问题', example: '' },
    ],
  },
};

// 情绪激励文案
export const ENCOURAGEMENTS = {
  demoComplete: [
    '太配合啦🥰！我已经 get 到你的小偏好～',
    '好棒好棒🌸！你的 Vibe 越来越清晰了～',
    '完美完美✨！距离专属歌单又近了一步～',
  ],
  quizComplete: [
    '宝～偏好收集完成✅，马上为你生成专属歌单哦',
    '太厉害了🎉！歌单马上就好～',
    '快了快了🌈！让我为你挑选最对味的歌～',
  ],
  playlistReady: [
    '搞定✅！专属你的场景 BGM 已上线～',
    '完成啦🎶！快听听你的专属歌单吧～',
    '好耶🥳！这份歌单就是为你量身打造的～',
  ],
  tuneComplete: [
    '歌单优化完成 ✅，更懂你的 Vibe 啦～',
    '调整好了🎵！这次应该更合你口味了～',
    '优化搞定✨！歌单越来越贴合你啦～',
  ],
};

// 生成伪专辑封面颜色
export function getAlbumColor(songName: string): string {
  const hash = simpleHash(songName);
  const hues = [10, 25, 35, 180, 210, 280, 330, 45, 150, 60];
  const hue = hues[hash % hues.length];
  const sat = 30 + (hash % 30);
  const light = 65 + (hash % 20);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export function getAlbumGradient(songName: string): string {
  const hash = simpleHash(songName);
  const hash2 = simpleHash(songName + 'alt');
  const hues = [10, 25, 35, 180, 210, 280, 330, 45, 150, 60];
  const h1 = hues[hash % hues.length];
  const h2 = hues[hash2 % hues.length];
  return `linear-gradient(135deg, hsl(${h1}, 35%, 72%), hsl(${h2}, 40%, 80%))`;
}

// V4: 歌单版本管理
export interface PlaylistVersion {
  version: number; // 1, 2, 3
  playlist: Song[];
  tuneLikes: Record<string, { sameStyle: boolean; sameArtist: boolean }>;
  tuneDislikes: Record<string, 'single' | 'style' | null>;
  allSongKeys: Set<string>; // 该版本所有出现过的歌曲key
}

// V4: 收集所有版本中被❌标记的歌曲key（仅排除不喜欢的，不排除全部）
export function collectDislikedSongKeys(versions: PlaylistVersion[]): Set<string> {
  const keys = new Set<string>();
  for (const v of versions) {
    for (const [key, val] of Object.entries(v.tuneDislikes)) {
      if (val === 'single' || val === 'style') {
        keys.add(key);
      }
    }
  }
  return keys;
}
