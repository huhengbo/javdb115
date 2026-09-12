import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
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
      await login(username, password);
      setPassword('');
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-mist px-5 py-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-[-0.03em] text-ink">JAVDB 115</h1>
        <form onSubmit={submit}>
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

          <label className="mb-2 mt-5 block text-sm font-medium text-ink" htmlFor={passwordId}>密码</label>
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
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-slate-500"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error ? <InlineAlert className="mt-4" tone="danger"><div className="flex items-start gap-2"><LockKeyhole className="mt-0.5 shrink-0" size={16} /><span>{error}</span></div></InlineAlert> : null}

          <button className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !username.trim() || !password} type="submit">
            {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
            <span>{submitting ? '登录中' : '登录'}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
