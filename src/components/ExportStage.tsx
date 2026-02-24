import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SceneResult } from '@/lib/useVibeStore';
import { getAlbumGradient } from '@/lib/vibeEngine';

interface ExportStageProps {
  results: SceneResult[];
  onRegenerate: () => void;
  onRestart: () => void;
}

export default function ExportStage({ results, onRegenerate, onRestart }: ExportStageProps) {
  const [copied, setCopied] = useState(false);

  // Generate export text
  const exportText = results.map(r => {
    const header = `【${r.scene.name}】`;
    const songs = r.playlist.map(s => `${s.name} - ${s.artist}`).join('\n');
    return `${header}\n${songs}`;
  }).join('\n\n');

  const [editableText, setEditableText] = useState(exportText);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = editableText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-screen flex-col items-center px-4 py-12"
    >
      <div className="w-full max-w-2xl">
        {/* Celebration header */}
        <div className="mb-10 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-semibold text-foreground">恭喜完成</h1>
          <p className="mt-2 text-muted-foreground">你的专属场景歌单已全部生成！</p>
          <p className="mt-1 text-sm text-muted-foreground">复制下方文本，导入网易云即可享受专属 BGM～</p>
        </div>

        {/* Scene summaries */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {results.map((r) => (
            <div key={r.scene.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">{r.scene.icon}</span>
                <span className="font-medium text-foreground">{r.scene.name}</span>
                <span className="text-xs text-muted-foreground">· {r.playlist.length} 首</span>
              </div>
              <div className="space-y-1.5">
                {r.playlist.slice(0, 3).map((s) => (
                  <div key={`${s.name}-${s.artist}`} className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 shrink-0 rounded text-[10px] flex items-center justify-center text-white/80 font-serif"
                      style={{ background: getAlbumGradient(s.name) }}
                    >
                      {s.name.charAt(0)}
                    </div>
                    <span className="truncate text-xs text-foreground">{s.name} - {s.artist}</span>
                  </div>
                ))}
                {r.playlist.length > 3 && (
                  <p className="text-xs text-muted-foreground">...+{r.playlist.length - 3} 首</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Editable text box */}
        <textarea
          value={editableText}
          onChange={(e) => setEditableText(e.target.value)}
          className="h-52 w-full resize-none rounded-2xl border border-border bg-card p-5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
        />

        {/* Copy button */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={handleCopy}
            className="rounded-xl bg-primary px-8 py-3 text-base font-medium text-primary-foreground hover:bg-vibe-pink-hover transition-colors"
          >
            {copied ? '已复制！' : '一键复制歌单'}
          </button>
        </div>

        {/* Guide */}
        <div className="mt-10 rounded-2xl bg-muted p-6">
          <h3 className="mb-4 font-serif text-base font-semibold text-foreground">📱 如何导入网易云音乐？</h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><span className="font-medium text-primary">1.</span> 复制上方的全部歌单文本（确保复制完整）</li>
            <li><span className="font-medium text-primary">2.</span> 打开手机版「网易云音乐」APP，点击底部「我的」</li>
            <li><span className="font-medium text-primary">3.</span> 在「我的」页面，找到「音乐」栏目右侧的 <strong>「⋮ 三个点」</strong> 图标</li>
            <li><span className="font-medium text-primary">4.</span> 在弹出菜单中，选择 <strong>「一键导入外部音乐」</strong></li>
            <li><span className="font-medium text-primary">5.</span> 进入导入页面后，选择「文字导入」，粘贴歌单文本</li>
            <li><span className="font-medium text-primary">6.</span> 点击「生成歌单」，完成！</li>
          </ol>
        </div>

        {/* Extra buttons */}
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={onRegenerate}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            重新生成歌单
          </button>
          <button
            onClick={onRestart}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            重新导入歌单
          </button>
        </div>
      </div>
    </motion.div>
  );
}
