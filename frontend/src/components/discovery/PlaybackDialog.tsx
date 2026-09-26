import { Copy, ExternalLink, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlaybackSession } from '../../types';
import { formatBytes } from '../../lib/javdb';

type PlayerMode = 'system' | 'browser';
const PLAYER_STORAGE_KEY = 'javdb115.playback.player';

type Props = {
  readonly error: string | null;
  readonly session: PlaybackSession | null;
  readonly onClose: () => void;
  readonly onSelectFile: (fileId: string) => void;
};

export function PlaybackDialog({ error, session, onClose, onSelectFile }: Props) {
  const [player, setPlayer] = useState<PlayerMode>('system');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (saved === 'system' || saved === 'browser') {
      setPlayer(saved);
    } else if (saved === 'potplayer' || saved === 'vlc') {
      setPlayer('system');
    }
  }, []);

  function updatePlayer(value: PlayerMode) {
    setPlayer(value);
    window.localStorage.setItem(PLAYER_STORAGE_KEY, value);
  }

  async function copyUrl() {
    if (!session?.play_url) return;
    await navigator.clipboard.writeText(session.play_url);
    setCopied(true);
  }

  async function openPlayer() {
    if (!session?.play_url) return;
    if (player === 'browser') {
      window.open(session.play_url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: session.file?.name || '在线播放',
          url: session.play_url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    window.location.href = session.play_url;
  }

  const progress = session?.progress_percent ?? 5;
  const busy = !error && (!session || ['submitting', 'offline_waiting', 'locating', 'resolving'].includes(session.status));

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="在线播放">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex justify-end">
          <button className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100" onClick={onClose} type="button" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {busy ? (
          <div className="flex flex-col items-center px-3 pb-5 pt-1 text-center">
            <ProgressRing value={progress} />
            <h3 className="mt-5 text-base font-semibold text-ink">正在准备在线播放</h3>
            <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
              {session?.message ?? '正在提交到 115…'}
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">请保持此窗口开启，完成后会自动进入播放。</p>
          </div>
        ) : null}

        {error ? (
          <div className="px-2 pb-3 text-center">
            <h3 className="text-base font-semibold text-ink">在线播放失败</h3>
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p>
            <button className="mt-4 min-h-11 w-full rounded-lg border border-line text-sm text-slate-600" onClick={onClose} type="button">关闭</button>
          </div>
        ) : null}

        {session?.status === 'select_required' ? (
          <div className="pb-2">
            <div className="text-center">
              <h3 className="text-base font-semibold text-ink">选择播放文件</h3>
              <p className="mt-1 text-xs text-slate-500">检测到多个主要视频文件</p>
            </div>
            <div className="mt-4 space-y-2">
              {session.files.map((file) => (
                <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-line p-3 text-left hover:bg-slate-50" key={file.id} onClick={() => onSelectFile(file.id)} type="button">
                  <span className="min-w-0 truncate text-sm text-ink">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size ?? 0)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {session?.status === 'ready' && session.play_url ? (
          <div className="pb-2">
            <div className="text-center">
              <ProgressRing value={100} />
              <h3 className="mt-4 text-base font-semibold text-ink">播放已准备好</h3>
              <p className="mt-1 truncate text-sm text-slate-500">{session.file?.name}</p>
              <p className="mt-1 text-xs text-slate-400">{formatBytes(session.file?.size ?? 0)}</p>
            </div>

            <label className="mt-5 block text-xs font-medium text-slate-600">
              播放方式
              <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" value={player} onChange={(event) => updatePlayer(event.target.value as PlayerMode)}>
                <option value="system">本机播放器（系统选择）</option>
                <option value="browser">浏览器播放</option>
              </select>
            </label>

            <button className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white active:opacity-90" onClick={() => void openPlayer()} type="button">
              <Play size={17} />立即播放
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line text-sm text-slate-600" onClick={() => void copyUrl()} type="button">
                <Copy size={15} />{copied ? '已复制' : '复制地址'}
              </button>
              <a className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line text-sm text-slate-600" href={session.play_url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />直接打开
              </a>
            </div>
          </div>
        ) : null}

        {session?.status === 'failed' && !error ? (
          <div className="px-2 pb-3 text-center">
            <h3 className="text-base font-semibold text-ink">在线播放失败</h3>
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-danger">{session.message}</p>
            <button className="mt-4 min-h-11 w-full rounded-lg border border-line text-sm text-slate-600" onClick={onClose} type="button">关闭</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProgressRing({ value }: { readonly value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative h-28 w-28">
      <svg className="-rotate-90" height="112" width="112" viewBox="0 0 112 112" aria-hidden="true">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-brand transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-ink">{normalized}%</span>
      </div>
    </div>
  );
}
