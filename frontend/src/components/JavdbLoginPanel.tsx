import { Loader2, LogIn, LogOut } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { client } from '../api';
import type { JavdbLoginStatus } from '../types';

type Props = {
  readonly focusRequestId: number;
  readonly onAuthChanged: (authenticated: boolean) => void;
};

export function JavdbLoginPanel({ focusRequestId, onAuthChanged }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<JavdbLoginStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void client.javdbLoginStatus()
      .then((next) => { if (active) setStatus(next); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (focusRequestId <= 0) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!status?.ok) window.setTimeout(() => usernameRef.current?.focus(), 180);
  }, [focusRequestId, status?.ok]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await client.loginJavdb(username.trim(), password);
      setPassword('');
      setStatus({ configured: true, ok: true, message: 'JavDB 已登录', account: result.account });
      onAuthChanged(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setSubmitting(true);
    setError(null);
    try {
      await client.logoutJavdb();
      setStatus({ configured: false, ok: false, message: '未登录 JavDB 账号', account: null });
      onAuthChanged(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const account = status?.ok ? status.account : null;
  const accountName = account?.username || account?.email || '已登录';

  return (
    <section className="scroll-mt-20 border-y border-line py-3" ref={sectionRef}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">JavDB 账号</h2>
        {loading ? <Loader2 className="animate-spin text-slate-400" size={17} /> : account ? <span className="text-xs text-emerald-700">已登录</span> : <span className="text-xs text-slate-500">未登录</span>}
      </div>

      {!loading && account ? (
        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{accountName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{account.is_vip ? 'VIP' : '普通账号'}{account.vip_expired_at ? ` · ${account.vip_expired_at}` : ''}</p>
          </div>
          <button aria-label="退出 JavDB 登录" className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm text-slate-500 disabled:opacity-50" disabled={submitting} onClick={() => void signOut()} type="button"><LogOut size={16} />退出</button>
        </div>
      ) : !loading ? (
        <form className="space-y-3 border-t border-line pt-3" onSubmit={(event) => void submit(event)}>
          {status?.configured && !status.ok ? <p className="text-sm text-amber-700">{status.message}</p> : null}
          <label className="block text-sm font-medium text-ink" htmlFor="javdb-username">用户名
            <input ref={usernameRef} autoComplete="username" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" id="javdb-username" onChange={(event) => setUsername(event.target.value)} value={username} />
          </label>
          <label className="block text-sm font-medium text-ink" htmlFor="javdb-password">密码
            <input autoComplete="current-password" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" id="javdb-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50" disabled={submitting || !username.trim() || !password} type="submit">{submitting ? <Loader2 className="animate-spin" size={17} /> : <LogIn size={17} />}登录 JavDB</button>
        </form>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </section>
  );
}
