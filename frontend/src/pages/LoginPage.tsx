import { LockKeyhole } from 'lucide-react';
import { FormEvent, useId, useState } from 'react';
import { login } from '../api';

type Props = {
  onLoggedIn: () => void;
};

export function LoginPage({ onLoggedIn }: Props) {
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    <main className="flex min-h-dvh items-center justify-center bg-mist px-4">
      <form className="w-full max-w-sm rounded-lg border border-line bg-white p-5" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-teal-50 p-2 text-brand">
            <LockKeyhole size={22} />
          </div>
          <h1 className="text-xl font-semibold text-ink">登录管理面板</h1>
        </div>
        <label className="mt-5 block text-sm font-medium text-ink" htmlFor={usernameId}>用户名</label>
        <input id={usernameId} autoComplete="username" className="mt-2 min-h-11 w-full rounded-md border border-line px-3" value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="mt-4 block text-sm font-medium text-ink" htmlFor={passwordId}>密码</label>
        <input id={passwordId} autoComplete="current-password" className="mt-2 min-h-11 w-full rounded-md border border-line px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button className="mt-5 min-h-11 w-full rounded-md bg-brand px-4 font-medium text-white disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
