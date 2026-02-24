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
  question: string;
  options: string[];
}

export interface UserPreference {
  dislikedGenres: string[];
  dislikedRhythms: string[];
  dislikedStyles: string[];
  likedSongs: Song[];
  quizAnswers: Record<string, string>;
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
      // try single dash
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

// 为场景选择 Demo 歌曲
export function selectDemoSongs(songs: Song[], scene: Scene, usedSongs: Set<string>): Song[] {
  const available = songs.filter(s => !usedSongs.has(`${s.name}-${s.artist}`));
  // 用场景名和歌曲名做伪随机排序
  const sorted = [...available].sort((a, b) => {
    const hashA = simpleHash(a.name + scene.id);
    const hashB = simpleHash(b.name + scene.id);
    return hashA - hashB;
  });
  return sorted.slice(0, 4);
}

// 根据偏好生成最终歌单
export function generatePlaylist(
  songs: Song[],
  scene: Scene,
  preference: UserPreference,
  usedInOtherScenes: Set<string>
): Song[] {
  // Start with liked songs from demo
  const liked = preference.likedSongs.filter(s => !usedInOtherScenes.has(`${s.name}-${s.artist}`));

  // Get remaining songs, excluding used ones
  const remaining = songs.filter(s => {
    const key = `${s.name}-${s.artist}`;
    if (usedInOtherScenes.has(key)) return false;
    if (liked.some(l => l.name === s.name && l.artist === s.artist)) return false;
    return true;
  });

  // Sort remaining by scene affinity (pseudo-random but deterministic)
  const sorted = [...remaining].sort((a, b) => {
    const hashA = simpleHash(a.name + scene.id + 'final');
    const hashB = simpleHash(b.name + scene.id + 'final');
    return hashA - hashB;
  });

  // Combine liked + sorted, max 10
  const result = [...liked, ...sorted].slice(0, 10);
  return result.length >= 3 ? result : result;
}

// 生成自适应选择题
export function generateQuizQuestions(songCount: number, scene: Scene): QuizQuestion[] {
  const baseQuestions: QuizQuestion[] = [
    {
      id: 'tempo-pref',
      question: `在「${scene.name}」场景下，你更喜欢什么节奏的歌？`,
      options: ['慢悠悠的', '中等节奏', '快节奏', '都可以'],
    },
    {
      id: 'mood-pref',
      question: `你希望「${scene.name}」的歌单整体氛围是？`,
      options: ['治愈温暖', '活力满满', '安静平和', '自由随性'],
    },
    {
      id: 'vocal-pref',
      question: '你更偏爱哪种人声风格？',
      options: ['温柔细腻', '有力量感', '慵懒随性', '清澈透亮'],
    },
    {
      id: 'lang-pref',
      question: '你更想听哪种语言的歌？',
      options: ['中文歌', '英文歌', '日韩歌', '都可以'],
    },
    {
      id: 'era-pref',
      question: '你更喜欢哪个年代的歌？',
      options: ['经典老歌', '近几年新歌', '最新热门', '无所谓'],
    },
    {
      id: 'instrument-pref',
      question: '你偏爱什么乐器伴奏？',
      options: ['钢琴/吉他', '电子合成器', '弦乐', '都喜欢'],
    },
    {
      id: 'repeat-pref',
      question: '你会反复单曲循环一首歌吗？',
      options: ['经常', '偶尔', '几乎不会', '看心情'],
    },
    {
      id: 'discover-pref',
      question: '你更倾向听熟悉的歌还是新歌？',
      options: ['熟悉的老歌', '想发现新歌', '一半一半', '看场景'],
    },
  ];

  let count = 4;
  if (songCount >= 200 && songCount < 500) count = 5;
  else if (songCount >= 500) count = 7;

  return baseQuestions.slice(0, count);
}

// 不喜欢原因选项
export const DISLIKE_REASONS = {
  type: {
    label: '类型不对味',
    icon: '🎵',
    details: ['太 R&B', '太说唱', '太流行', '太国风', '太电子', '曲风不符'],
  },
  rhythm: {
    label: '节奏不得劲',
    icon: '🥁',
    details: ['鼓点太紧凑', '鼓点太舒缓', '太炸耳', '太沉闷', '律动不足'],
  },
  style: {
    label: '风格不戳我',
    icon: '💫',
    details: ['太甜蜜', '太伤感', '太酷炫', '太温柔', '太励志', '风格不符'],
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
    '厉害厉害👍！再一步就拥有专属歌单啦～',
    '太厉害了🎉！歌单马上就好～',
    '快了快了🌈！让我为你挑选最对味的歌～',
  ],
  playlistReady: [
    '搞定✅！专属你的场景 BGM 已上线～',
    '完成啦🎶！快听听你的专属歌单吧～',
    '好耶🥳！这份歌单就是为你量身打造的～',
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
