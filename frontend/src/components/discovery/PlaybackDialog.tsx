import { Copy, ExternalLink, Loader2, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlaybackSession } from '../../types';
import { formatMagnetSize } from '../../lib/javdb';

type PlayerMode = 'system' | 'potplayer' | 'vlc';
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
    if (saved === 'system' || saved === 'potplayer' || saved === 'vlc') setPlayer(saved);
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

  function openPlayer() {
    if (!session?.play_url) return;
    if (player === 'potplayer') {
      window.location.href = `potplayer://${session.play_url}`;
      return;
    }
    if (player === 'vlc') {
      window.location.href = `vlc://${session.play_url}`;
      return;
    }
    window.open(session.play_url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="在线播放">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">在线播放</h3>
            <p className="mt-1 text-xs text-slate-500">115 临时离线完成后获取播放地址，不进入正式整理任务。</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500" onClick={onClose} type="button" aria-label="关闭"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          {!error && session ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                {['offline_waiting', 'locating', 'resolving', 'submitting'].includes(session.status) ? <Loader2 className="animate-spin" size={16} /> : null}
                <span>{session.message}</span>
              </div>
              <p className="text-xs text-slate-400">临时任务将在 {new Date(session.expires_at).toLocaleString()} 后过期。</p>
            </div>
          ) : null}
        </div>

        {session?.status === 'select_required' ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-ink">选择要播放的视频</p>
            {session.files.map((file) => (
              <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-line p-3 text-left" key={file.id} onClick={() => onSelectFile(file.id)} type="button">
                <span className="min-w-0 truncate text-sm text-ink">{file.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatMagnetSize(file.size ?? 0)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {session?.status === 'ready' && session.play_url ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-line p-3">
              <p className="truncate text-sm font-medium text-ink">{session.file?.name}</p>
              <p className="mt-1 text-xs text-slate-500">{formatMagnetSize(session.file?.size ?? 0)}</p>
            </div>

            <label className="block text-xs font-medium text-slate-600">
              默认播放方式
              <select className="mt-1 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink" value={player} onChange={(event) => updatePlayer(event.target.value as PlayerMode)}>
                <option value="system">系统 / 浏览器打开</option>
                <option value="potplayer">PotPlayer</option>
                <option value="vlc">VLC</option>
              </select>
            </label>

            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white" onClick={openPlayer} type="button"><Play size={17} />立即播放</button>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line text-sm text-slate-600" onClick={() => void copyUrl()} type="button"><Copy size={15} />{copied ? '已复制' : '复制地址'}</button>
              <a className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line text-sm text-slate-600" href={session.play_url} target="_blank" rel="noreferrer"><ExternalLink size={15} />直接打开</a>
            </div>
          </div>
        ) : null}

        {session?.status === 'failed' ? (
          <button className="mt-4 min-h-11 w-full rounded-lg border border-line text-sm text-slate-600" onClick={onClose} type="button">关闭</button>
        ) : null}
      </div>
    </div>
  );
}
