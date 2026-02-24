import { useState } from 'react';
import { motion } from 'framer-motion';
import { parseSongs, EXAMPLE_SONGS, type Song } from '@/lib/vibeEngine';

interface SongInputStageProps {
  onNext: (songs: Song[]) => void;
}

export default function SongInputStage({ onNext }: SongInputStageProps) {
  const [text, setText] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const parsed = parseSongs(text);
  const isValid = parsed.length > 0;

  const fillExample = () => {
    setText(EXAMPLE_SONGS);
  };

  const handleNext = () => {
    if (isValid) onNext(parsed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-2xl">
        {/* Title */}
        <h1 className="mb-3 text-center text-3xl font-semibold text-foreground">
          导入你的歌单
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          粘贴歌曲文本，格式要求「歌曲名 - 歌手」（例：七里香 - 周杰伦）
        </p>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"七里香 - 周杰伦\n晴天 - 周杰伦\n小幸运 - 田馥甄\n..."}
            className="h-72 w-full resize-none rounded-2xl border border-border bg-card p-5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all duration-300"
          />
          {text && (
            <div className="absolute bottom-3 right-3 rounded-lg bg-secondary px-3 py-1 text-sm text-muted-foreground">
              已识别 {parsed.length} 首歌曲
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            onClick={fillExample}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary"
          >
            使用示例
          </button>
        </div>

        <div className="mt-5 flex justify-center">
          <button
            onClick={handleNext}
            disabled={!isValid}
            className="rounded-xl bg-primary px-8 py-3 text-base font-medium text-primary-foreground transition-all duration-200 hover:bg-vibe-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一步 →
          </button>
        </div>

        {/* Validation hint */}
        {text && !isValid && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            请粘贴有效歌曲文本（格式：歌曲名 - 歌手）
          </p>
        )}

        {/* Guide toggle */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
          >
            如何从网易云导出歌曲文本？
          </button>
        </div>

        {/* Guide popup */}
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl border border-border bg-popover/80 p-6 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between">
              <h3 className="mb-3 font-serif text-base font-semibold text-foreground">📱 网易云导出步骤</h3>
              <button onClick={() => setShowGuide(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. 打开网易云音乐 APP → 我的 → 歌单 → 选择要导出的歌单</li>
              <li>2. 点击右上角「⋮」→ 选择「导出歌单」→ 选择「文本导出」</li>
              <li>3. 复制导出的文本，粘贴到上方输入框即可</li>
            </ol>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
