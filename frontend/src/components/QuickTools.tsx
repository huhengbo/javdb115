import { ChevronRight, Download, Loader2, Wrench, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { client } from '../api';

type ToolView = 'menu' | 'offline';

type Props = {
  readonly hidden?: boolean;
};

export function QuickTools({ hidden = false }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ToolView>('menu');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function close() {
    if (submitting) return;
    setOpen(false);
    setView('menu');
    setError(null);
    setMessage(null);
  }

  function openOffline() {
    setView('offline');
    setError(null);
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = url.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.quickOfflineDownload(value);
      setUrl('');
      setMessage(`已提交到 115 · ${result.task_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!hidden || open ? (
        <button
          aria-expanded={open}
          aria-label="快捷工具"
          className="fixed z-[85] flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg active:scale-95"
          onClick={() => setOpen(true)}
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))', right: 'max(1rem, calc((100vw - 48rem) / 2 + 1rem))' }}
          type="button"
        >
          <Wrench size={20} />
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[86] flex items-end justify-center bg-slate-900/35 sm:items-center" role="presentation" onClick={close}>
          <section
            aria-label="快捷工具"
            aria-modal="true"
            className="w-full max-w-md rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:rounded-2xl sm:pb-4"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="min-w-0">
                {view === 'offline' ? <button className="text-sm text-slate-500" onClick={() => setView('menu')} type="button">快捷工具</button> : null}
                <h2 className="text-base font-semibold text-ink">{view === 'offline' ? '115 离线下载' : '快捷工具'}</h2>
              </div>
              <button aria-label="关闭快捷工具" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100" disabled={submitting} onClick={close} type="button"><X size={19} /></button>
            </div>

            {view === 'menu' ? (
              <div className="mt-2 border-y border-line">
                <button className="flex min-h-14 w-full items-center gap-3 py-2 text-left" onClick={openOffline} type="button">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-brand"><Download size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">115 离线下载</span><span className="mt-0.5 block text-xs text-slate-500">提交磁力链接或离线地址</span></span>
                  <ChevronRight className="shrink-0 text-slate-400" size={18} />
                </button>
              </div>
            ) : (
              <form className="mt-2" onSubmit={(event) => void submit(event)}>
                <label className="block text-sm font-medium text-ink" htmlFor="quick-offline-url">磁力链接或离线地址</label>
                <textarea
                  autoFocus
                  className="mt-2 min-h-28 w-full resize-none rounded-lg border border-line bg-white p-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  id="quick-offline-url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="粘贴 magnet、HTTP 或 HTTPS 地址"
                  value={url}
                />
                <p className="mt-2 text-xs text-slate-500">保存到设置中的 115 下载临时目录；快捷离线不会生成作品整理任务。</p>
                {message ? <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p> : null}
                {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
                <button className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50" disabled={submitting || !url.trim()} type="submit">
                  {submitting ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
                  {submitting ? '提交中' : '提交到 115'}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
