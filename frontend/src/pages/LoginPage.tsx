import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useId, useState } from 'react';
import { login } from '../api';
import { InlineAlert } from '../components/ui';

type Props = {
  onLoggedIn: () => void;
};

export function LoginPage({ onLoggedIn }: Props) {
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !username.trim() || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      setPassword('');
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-mist px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <div className="mb-6 px-1 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-brand"><ShieldCheck size={25} /></div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">JAVDB 115</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">欢迎回来</h1>
          <p className="mt-2 text-sm text-slate-500">登录后管理发现、关注、离线任务与自动整理。</p>
        </div>
        <form className="ui-surface-elevated p-5" onSubmit={submit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink" htmlFor={usernameId}>用户名</label>
            <input
              id={usernameId}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className="field-control"
              enterKeyHint="next"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-ink" htmlFor={passwordId}>密码</label>
            <div className="relative">
              <input
                id={passwordId}
                autoComplete="current-password"
                className="field-control pr-12"
                enterKeyHint="go"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error ? <InlineAlert className="mt-4" tone="danger"><div className="flex items-start gap-2"><LockKeyhole className="mt-0.5 shrink-0" size={16} /><span>{error}</span></div></InlineAlert> : null}
          <button className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !username.trim() || !password} type="submit">
            {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
            <span>{submitting ? '登录中' : '登录'}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
