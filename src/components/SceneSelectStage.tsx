import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SCENES, type Scene, type VibeProfile } from '@/lib/vibeEngine';

interface SceneSelectStageProps {
  onStart: (scenes: Scene[]) => void;
  onBack: () => void;
}

const TONE_TAGS = [
  { label: '治愈', mood: ['治愈', '温暖'] },
  { label: '活力', mood: ['活力', '激情'] },
  { label: '安静', mood: ['安静', '平静'] },
  { label: '浪漫', mood: ['浪漫', '甜蜜'] },
  { label: '自由', mood: ['自由', '畅快'] },
  { label: '伤感', mood: ['伤感', '惆怅'] },
];

const TEMPO_OPTIONS: { label: string; value: VibeProfile['tempo'] }[] = [
  { label: '慢', value: 'slow' },
  { label: '中', value: 'medium' },
  { label: '快', value: 'fast' },
];

export default function SceneSelectStage({ onStart, onBack }: SceneSelectStageProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customScenes, setCustomScenes] = useState<Scene[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTone, setCustomTone] = useState<string | null>(null);
  const [customTempo, setCustomTempo] = useState<VibeProfile['tempo']>('medium');
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const allScenes = [...SCENES, ...customScenes];

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    const tone = TONE_TAGS.find(t => t.label === customTone);
    const newScene: Scene = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      icon: '✨',
      description: `${customTone || '自定义'}场景`,
      vibeProfile: {
        genres: ['流行', '民谣', 'R&B'],
        tempo: customTempo,
        mood: tone?.mood || ['自由', '随性'],
      },
    };
    setCustomScenes(prev => [...prev, newScene]);
    setSelected(prev => new Set(prev).add(newScene.id));
    setCustomName('');
    setCustomTone(null);
    setCustomTempo('medium');
    setShowCustomInput(false);
  };

  const handleStart = () => {
    const scenes = allScenes.filter(s => selected.has(s.id));
    if (scenes.length > 0) onStart(scenes);
  };

  const handleBack = () => {
    if (selected.size > 0) {
      setShowBackConfirm(true);
    } else {
      onBack();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex min-h-screen flex-col items-center px-4 py-12"
    >
      {/* Back button */}
      <div className="w-full max-w-3xl mb-6">
        <button
          onClick={handleBack}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        >
          ← 返回
        </button>
      </div>

      <h1 className="mb-2 text-center text-3xl font-semibold text-foreground">
        选择你的歌单使用场景
      </h1>
      <p className="mb-10 text-center text-muted-foreground">可多选，我会为每个场景生成专属歌单</p>

      {/* Scene grid */}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {allScenes.map((scene) => {
          const isSelected = selected.has(scene.id);
          return (
            <motion.button
              key={scene.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggle(scene.id)}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-6 transition-all duration-200 ${
                isSelected
                  ? 'border-primary bg-vibe-pink-light shadow-sm'
                  : 'border-border bg-card hover:bg-secondary'
              }`}
            >
              <span className="text-4xl">{scene.icon}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {scene.name}
              </span>
              <span className="text-xs text-muted-foreground">{scene.description}</span>
            </motion.button>
          );
        })}

        {/* Add custom scene card */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCustomInput(true)}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card p-6 transition-all duration-200 hover:border-primary hover:bg-secondary"
        >
          <span className="text-4xl">➕</span>
          <span className="text-sm font-medium text-muted-foreground">自定义场景</span>
        </motion.button>
      </div>

      {/* Footer */}
      <div className="mt-10 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          已选：{selected.size} 个场景
        </p>
        <button
          onClick={handleStart}
          disabled={selected.size === 0}
          className="rounded-xl bg-primary px-8 py-3 text-base font-medium text-primary-foreground transition-all duration-200 hover:bg-vibe-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          开始生成我的 Vibe 歌单
        </button>
        {selected.size === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">请至少选择 1 个场景</p>
        )}
      </div>

      {/* Custom scene input modal */}
      <AnimatePresence>
        {showCustomInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm px-4"
            onClick={() => setShowCustomInput(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-foreground font-serif">✨ 创建自定义场景</h3>

              {/* Name input */}
              <label className="mb-1 block text-sm text-muted-foreground">场景名称</label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="例如：深夜独处、咖啡馆、约会"
                maxLength={10}
                className="mb-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
              />

              {/* Tone tags */}
              <label className="mb-2 block text-sm text-muted-foreground">调性选择</label>
              <div className="mb-4 flex flex-wrap gap-2">
                {TONE_TAGS.map(tag => (
                  <button
                    key={tag.label}
                    onClick={() => setCustomTone(customTone === tag.label ? null : tag.label)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-all duration-200 ${
                      customTone === tag.label
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>

              {/* Tempo */}
              <label className="mb-2 block text-sm text-muted-foreground">节奏偏好</label>
              <div className="mb-6 flex gap-2">
                {TEMPO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setCustomTempo(opt.value)}
                    className={`flex-1 rounded-lg py-2 text-sm transition-all duration-200 ${
                      customTempo === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomInput(false)}
                  className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
                >
                  取消
                </button>
                <button
                  onClick={handleAddCustom}
                  disabled={!customName.trim()}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-vibe-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  添加场景
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back confirmation modal */}
      <AnimatePresence>
        {showBackConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm px-4"
            onClick={() => setShowBackConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg text-center"
              onClick={e => e.stopPropagation()}
            >
              <p className="mb-1 text-lg font-semibold text-foreground font-serif">确认返回？</p>
              <p className="mb-6 text-sm text-muted-foreground">返回将清除当前已选择的场景</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBackConfirm(false)}
                  className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
                >
                  继续选择
                </button>
                <button
                  onClick={() => { setShowBackConfirm(false); onBack(); }}
                  className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-medium text-destructive-foreground transition-all hover:opacity-90"
                >
                  确认返回
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
