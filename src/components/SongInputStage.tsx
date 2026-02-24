import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseSongs, EXAMPLE_SONGS, type Song } from '@/lib/vibeEngine';
import { supabase } from '@/integrations/supabase/client';

interface SongInputStageProps {
  onNext: (songs: Song[]) => void;
}

type InputMode = 'link' | 'text';
type ParseStatus = 'idle' | 'loading' | 'success' | 'error';

export default function SongInputStage({ onNext }: SongInputStageProps) {
  const [mode, setMode] = useState<InputMode>('link');
  const [linkInput, setLinkInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle');
  const [parsedFromLink, setParsedFromLink] = useState<string[]>([]);
  const [parseError, setParseError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // For text mode
  const textParsed = parseSongs(textInput);
  const textIsValid = textParsed.length > 0;

  // For link mode
  const linkIsValid = parseStatus === 'success' && parsedFromLink.length > 0;

  const handleParseLink = async () => {
    if (!linkInput.trim()) return;
    setParseStatus('loading');
    setParseError('');
    setParsedFromLink([]);

    try {
      const { data, error } = await supabase.functions.invoke('parse-playlist', {
        body: { url: linkInput.trim() },
      });

      if (error) {
        setParseStatus('error');
        setParseError('解析失败，请检查链接是否有效');
        return;
      }

      if (!data.success) {
        setParseStatus('error');
        setParseError(data.error || '解析失败');
        return;
      }

      setParsedFromLink(data.songs);
      setParseStatus('success');
    } catch {
      setParseStatus('error');
      setParseError('网络异常，请稍后重试');
    }
  };

  const handleLinkInputChange = (value: string) => {
    setLinkInput(value);
    // Reset parse status when input changes
    if (parseStatus !== 'idle') {
      setParseStatus('idle');
      setParsedFromLink([]);
      setParseError('');
    }
  };

  const handleNext = () => {
    if (mode === 'link' && linkIsValid) {
      // Convert parsed link songs to Song objects
      const songs = parseSongs(parsedFromLink.join('\n'));
      if (songs.length > 0) onNext(songs);
    } else if (mode === 'text' && textIsValid) {
      onNext(textParsed);
    }
  };

  const fillExample = () => {
    if (mode === 'text') {
      setTextInput(EXAMPLE_SONGS);
    } else {
      // Fill example link and auto-parse
      const exampleLink = 'http://163cn.tv/zoIxm3';
      setLinkInput(exampleLink);
      setParseStatus('idle');
      setParsedFromLink([]);
      setParseError('');
      // Auto trigger parse after setting
      setTimeout(async () => {
        setParseStatus('loading');
        try {
          const { data, error } = await supabase.functions.invoke('parse-playlist', {
            body: { url: exampleLink },
          });
          if (error || !data?.success) {
            setParseStatus('error');
            setParseError(data?.error || '示例链接解析失败，请尝试手动输入');
            return;
          }
          setParsedFromLink(data.songs);
          setParseStatus('success');
        } catch {
          setParseStatus('error');
          setParseError('网络异常，请稍后重试');
        }
      }, 100);
    }
  };

  const canProceed = mode === 'link' ? linkIsValid : textIsValid;

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
          {mode === 'link'
            ? '粘贴歌单分享链接，系统将自动解析（支持网易云、QQ音乐、汽水音乐）'
            : '粘贴歌曲文本，格式要求「歌曲名 - 歌手」（例：七里香 - 周杰伦）'}
        </p>

        {/* Mode switcher */}
        <div className="mb-6 flex justify-center">
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            <button
              onClick={() => setMode('link')}
              className={`rounded-lg px-5 py-2 text-sm transition-all duration-200 ${
                mode === 'link'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🔗 链接导入
            </button>
            <button
              onClick={() => setMode('text')}
              className={`rounded-lg px-5 py-2 text-sm transition-all duration-200 ${
                mode === 'text'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📝 文本导入
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'link' ? (
            <motion.div
              key="link"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Link input */}
              <div className="relative">
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => handleLinkInputChange(e.target.value)}
                  placeholder="粘贴歌单分享链接，如：http://163cn.tv/zoIxm3"
                  className="w-full rounded-2xl border border-border bg-card px-5 py-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all duration-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && linkInput.trim()) handleParseLink();
                  }}
                />
              </div>

              {/* Parse button */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleParseLink}
                  disabled={!linkInput.trim() || parseStatus === 'loading'}
                  className="rounded-xl border border-border bg-card px-6 py-2.5 text-sm text-foreground transition-colors duration-200 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {parseStatus === 'loading' ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      正在解析歌单～
                    </span>
                  ) : '获取歌单'}
                </button>
              </div>

              {/* Parse result */}
              {parseStatus === 'success' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-2xl border border-primary/30 bg-vibe-pink-light p-4 text-center"
                >
                  <p className="text-sm text-foreground">
                    ✅ 解析成功！共识别 <strong>{parsedFromLink.length}</strong> 首歌曲
                  </p>
                </motion.div>
              )}

              {parseStatus === 'error' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center"
                >
                  <p className="text-sm text-destructive">{parseError}</p>
                </motion.div>
              )}

              <p className="mt-3 text-center text-xs text-muted-foreground">
                链接粘贴后点击「获取歌单」自动解析，无需手动复制歌曲信息
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="text"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Text input */}
              <div className="relative">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={"七里香 - 周杰伦\n晴天 - 周杰伦\n小幸运 - 田馥甄\n..."}
                  className="h-72 w-full resize-none rounded-2xl border border-border bg-card p-5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all duration-300"
                />
                {textInput && (
                  <div className="absolute bottom-3 right-3 rounded-lg bg-secondary px-3 py-1 text-sm text-muted-foreground">
                    已识别 {textParsed.length} 首歌曲
                  </div>
                )}
              </div>

              {/* Validation hint */}
              {textInput && !textIsValid && (
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  请粘贴有效歌曲文本（格式：歌曲名 - 歌手）
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            onClick={fillExample}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-secondary"
          >
            {mode === 'link' ? '使用示例链接' : '使用示例'}
          </button>
        </div>

        <div className="mt-5 flex justify-center">
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="rounded-xl bg-primary px-8 py-3 text-base font-medium text-primary-foreground transition-all duration-200 hover:bg-vibe-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一步 →
          </button>
        </div>

        {/* Guide toggle */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
          >
            {mode === 'link' ? '如何获取歌单分享链接？' : '如何从网易云导出歌曲文本？'}
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
              <h3 className="mb-3 font-serif text-base font-semibold text-foreground">
                {mode === 'link' ? '🔗 如何获取歌单分享链接' : '📱 网易云导出步骤'}
              </h3>
              <button onClick={() => setShowGuide(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
            {mode === 'link' ? (
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li><span className="font-medium text-primary">1.</span> 打开网易云音乐 APP → 我的 → 歌单 → 选择要导入的歌单</li>
                <li><span className="font-medium text-primary">2.</span> 点击右上角「⋮」→ 选择「分享」→ 选择「复制链接」</li>
                <li><span className="font-medium text-primary">3.</span> 将复制的链接粘贴到上方输入框，点击「获取歌单」即可</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li><span className="font-medium text-primary">1.</span> 打开网易云音乐 APP → 我的 → 歌单 → 选择要导出的歌单</li>
                <li><span className="font-medium text-primary">2.</span> 点击右上角「⋮」→ 选择「导出歌单」→ 选择「文本导出」</li>
                <li><span className="font-medium text-primary">3.</span> 复制导出的文本，粘贴到上方输入框即可</li>
              </ol>
            )}
          </motion.div>
        )}

        {/* Privacy note */}
        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          🔒 所有数据仅在本地处理，不上传服务器、不长期存储
        </p>
      </div>
    </motion.div>
  );
}
