import { Copy, ExternalLink, Loader2, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlaybackSession } from '../../types';
import { formatBytes } from '../../lib/javdb';
import { VideoPlayer } from './VideoPlayer';

type PlayerMode = 'system' | 'browser';
const PLAYER_STORAGE_KEY = 'javdb115.playback.player';
const POLLING_STATUSES = ['submitting', 'offline_waiting', 'locating', 'resolving'];
// 浏览器通常无法直接解码这些容器，页面内播放大概率失败
const BROWSER_UNFRIENDLY_EXTENSIONS = ['mkv', 'avi', 'wmv', 'flv', 'rmvb', 'rm', 'ts'];

type Props = {
  readonly error: string | null;
  readonly session: PlaybackSession | null;
  readonly selecting: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSelectFile: (fileId: string) => void;
};

export function PlaybackDialog({ error, session, selecting, onClose, onRetry, onSelectFile }: Props) {
  const [player, setPlayer] = useState<PlayerMode>('browser');
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [systemHint, setSystemHint] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  // 后端返回的是相对路径，外部播放器需要完整地址
  const playUrl = session?.status === 'ready' && session.play_url
    ? new URL(session.play_url, window.location.origin).href
    : null;
  const fileName = session?.file?.name ?? '';
  const unfriendlyFormat = BROWSER_UNFRIENDLY_EXTENSIONS.includes(fileName.split('.').pop()?.toLowerCase() ?? '');

  useEffect(() => {
    const saved = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (saved === 'system' || saved === 'browser') {
      setPlayer(saved);
    } else if (saved === 'potplayer' || saved === 'vlc') {
      setPlayer('system');
    }
  }, []);

  useEffect(() => {
    setCopied(false);
    setManualCopy(false);
    setSystemHint(null);
    setWatching(false);
  }, [playUrl]);

  function updatePlayer(value: PlayerMode) {
    setPlayer(value);
    setSystemHint(null);
    window.localStorage.setItem(PLAYER_STORAGE_KEY, value);
  }

  async function copyUrl(): Promise<boolean> {
    if (!playUrl) return false;
    const ok = await copyText(playUrl);
    setCopied(ok);
    setManualCopy(!ok);
    return ok;
  }

  async function openPlayer() {
    if (!playUrl) return;
    if (player === 'browser') {
      setWatching(true);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: fileName || '在线播放', url: playUrl });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      }
    }
    // 桌面浏览器无法直接唤起本机播放器：复制地址后在播放器中打开网络串流
    const ok = await copyUrl();
    setSystemHint(ok
      ? '已复制播放地址，请在 VLC / PotPlayer / IINA 等播放器中选择“打开网络串流”并粘贴。'
      : '请手动复制下方地址，在 VLC / PotPlayer / IINA 等播放器中选择“打开网络串流”并粘贴。');
  }

  if (watching && playUrl) {
    return <VideoPlayer src={playUrl} title={fileName} onClose={() => setWatching(false)} />;
  }

  const progress = session?.progress_percent ?? 5;
  const view = error
    ? 'error'
    : !session || POLLING_STATUSES.includes(session.status)
      ? 'busy'
      : session.status === 'select_required'
        ? 'select'
        : playUrl
          ? 'ready'
          : 'failed';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="在线播放">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex justify-end">
          <button className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100" onClick={onClose} type="button" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {view === 'busy' ? (
          <div className="flex flex-col items-center px-3 pb-5 pt-1 text-center">
            <ProgressRing value={progress} />
            <h3 className="mt-5 text-base font-semibold text-ink">正在准备在线播放</h3>
            <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
              {session?.message ?? '正在提交到 115…'}
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">请保持此窗口开启，准备完成后即可播放。</p>
          </div>
        ) : null}

        {view === 'error' || view === 'failed' ? (
          <div className="px-2 pb-3 text-center">
            <h3 className="text-base font-semibold text-ink">在线播放失败</h3>
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error ?? session?.message}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="min-h-11 rounded-lg border border-line text-sm text-slate-600" onClick={onClose} type="button">关闭</button>
              <button className="min-h-11 rounded-lg bg-brand text-sm font-medium text-white" onClick={onRetry} type="button">重试</button>
            </div>
          </div>
        ) : null}

        {view === 'select' && session ? (
          <div className="pb-2">
            <div className="text-center">
              <h3 className="text-base font-semibold text-ink">选择播放文件</h3>
              <p className="mt-1 text-xs text-slate-500">检测到多个主要视频文件</p>
            </div>
            <div className="mt-4 space-y-2">
              {session.files.map((file) => (
                <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-line p-3 text-left hover:bg-slate-50 disabled:opacity-50" disabled={selecting} key={file.id} onClick={() => onSelectFile(file.id)} type="button">
                  <span className="min-w-0 truncate text-sm text-ink">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size ?? 0)}</span>
                </button>
              ))}
            </div>
            {selecting ? <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="animate-spin" size={14} />正在准备播放地址…</p> : null}
          </div>
        ) : null}

        {view === 'ready' && session && playUrl ? (
          <div className="pb-2">
            <div className="text-center">
              <ProgressRing value={100} />
              <h3 className="mt-4 text-base font-semibold text-ink">播放已准备好</h3>
              {session.files.length > 1 ? null : (
                <>
                  <p className="mt-1 truncate text-sm text-slate-500">{fileName}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatBytes(session.file?.size ?? 0)}</p>
                </>
              )}
            </div>

            {session.files.length > 1 ? (
              <label className="mt-5 block text-xs font-medium text-slate-600">
                播放文件
                <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:opacity-50" disabled={selecting} value={session.file?.id ?? ''} onChange={(event) => onSelectFile(event.target.value)}>
                  {session.files.map((file) => (
                    <option key={file.id} value={file.id}>{file.name}（{formatBytes(file.size ?? 0)}）</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-slate-600">
              播放方式
              <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" value={player} onChange={(event) => updatePlayer(event.target.value as PlayerMode)}>
                <option value="browser">页面内播放（倍速 / 快进 / 全屏）</option>
                <option value="system">本机播放器（VLC / PotPlayer 等）</option>
              </select>
            </label>
            {player === 'browser' && unfriendlyFormat ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-700">该文件格式浏览器可能无法播放，失败时请改用本机播放器。</p>
            ) : null}

            <button className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white active:opacity-90 disabled:opacity-50" disabled={selecting} onClick={() => void openPlayer()} type="button">
              {selecting ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}立即播放
            </button>
            {systemHint ? <p className="mt-2 text-xs leading-5 text-slate-500" role="status">{systemHint}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line text-sm text-slate-600" onClick={() => void copyUrl()} type="button">
                <Copy size={15} />{copied ? '已复制' : '复制地址'}
              </button>
              <a className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line text-sm text-slate-600" href={playUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />新标签打开
              </a>
            </div>
            {manualCopy ? (
              <input
                className="mt-2 min-h-10 w-full rounded-lg border border-line bg-slate-50 px-3 font-mono text-xs text-slate-700"
                readOnly
                value={playUrl}
                aria-label="播放地址"
                onFocus={(event) => event.currentTarget.select()}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // HTTP 部署时 Clipboard API 不可用，退回到传统的选中复制
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function ProgressRing({ value }: { readonly value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative mx-auto h-28 w-28">
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
