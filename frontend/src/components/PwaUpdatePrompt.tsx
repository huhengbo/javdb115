import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyPwaUpdate } from '../pwa';

export function PwaUpdatePrompt() {
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const showUpdate = () => setAvailable(true);
    window.addEventListener('pwa-update-available', showUpdate);
    return () => window.removeEventListener('pwa-update-available', showUpdate);
  }, []);

  if (!available) {
    return null;
  }

  async function update() {
    setUpdating(true);
    try {
      await applyPwaUpdate();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <aside
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-lg"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">有新版本可用</p>
        <p className="mt-0.5 text-xs text-slate-500">确认后刷新到最新版本。</p>
      </div>
      <button
        className="flex min-h-10 shrink-0 items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-60"
        disabled={updating}
        onClick={() => void update()}
        type="button"
      >
        <RefreshCw className={updating ? 'animate-spin' : ''} size={16} />
        {updating ? '更新中' : '更新'}
      </button>
    </aside>
  );
}
