import { useState } from 'react';
import { motion } from 'framer-motion';
import { SCENES, type Scene } from '@/lib/vibeEngine';

interface SceneSelectStageProps {
  onStart: (scenes: Scene[]) => void;
  onBack: () => void;
}

export default function SceneSelectStage({ onStart, onBack }: SceneSelectStageProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    const scenes = SCENES.filter(s => selected.has(s.id));
    if (scenes.length > 0) onStart(scenes);
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
          onClick={onBack}
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
        {SCENES.map((scene) => {
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
    </motion.div>
  );
}
