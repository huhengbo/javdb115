import { CheckCircle, Loader2, QrCode, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from '../api';
import type { P115LoginDevice, P115QrStart, P115QrStatus } from '../types';

const TERMINAL_STATUSES = new Set(['succeeded', 'expired', 'cancelled', 'failed']);

type Props = {
  readonly onSuccess: () => void | Promise<void>;
};

export function P115QrLoginPanel({ onSuccess }: Props) {
  const [devices, setDevices] = useState<P115LoginDevice[]>([]);
  const [device, setDevice] = useState('alipaymini');
  const [session, setSession] = useState<P115QrStart | null>(null);
  const [status, setStatus] = useState<P115QrStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSessionId = useRef<string | null>(null);
  const successNotified = useRef<Set<string>>(new Set());

  useEffect(() => {
    client.p115LoginDevices().then(setDevices).catch((err: Error) => setError(err.message));
  }, []);

  const refreshStatus = useCallback(async (sessionId: string) => {
    try {
      const next = await client.p115QrLoginStatus(sessionId);
      if (currentSessionId.current !== sessionId) return;
      setStatus(next);
      setError(null);
      if (next.status === 'succeeded' && !successNotified.current.has(sessionId)) {
        successNotified.current.add(sessionId);
        await onSuccess();
      }
    } catch (err) {
      if (currentSessionId.current === sessionId) setError((err as Error).message);
    }
  }, [onSuccess]);

  useEffect(() => {
    if (!session || TERMINAL_STATUSES.has(status?.status ?? '')) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await refreshStatus(session.session_id);
      if (!cancelled) timer = window.setTimeout(() => void poll(), 3000);
    };
    timer = window.setTimeout(() => void poll(), 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshStatus, session, status?.status]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await client.startP115QrLogin(device);
      currentSessionId.current = next.session_id;
      setSession(next);
      setStatus({ session_id: next.session_id, status: 'waiting', message: '等待扫码', account: null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!session || cancelBusy) return;
    setCancelBusy(true);
    setError(null);
    try {
      await client.cancelP115QrLogin(session.session_id);
      if (currentSessionId.current === session.session_id) {
        currentSessionId.current = null;
        setSession(null);
        setStatus(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelBusy(false);
    }
  }

  const terminal = TERMINAL_STATUSES.has(status?.status ?? '');
  const succeeded = status?.status === 'succeeded';

  return (
    <section className="border-t border-line pt-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink"><QrCode size={16} />115 扫码登录</h2>
      <div className="mt-3 grid gap-3">
        <DeviceSelect devices={devices} value={device} onChange={setDevice} />
        {(!session || terminal) && !succeeded ? (
          <button className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy} onClick={() => void start()} type="button">
            {busy ? <Loader2 className="animate-spin" size={16} /> : terminal ? <RotateCcw size={16} /> : <QrCode size={16} />}
            {busy ? '生成中...' : terminal ? '重新生成二维码' : '生成二维码'}
          </button>
        ) : null}
        {session && !terminal ? <ActiveQrSession cancelBusy={cancelBusy} session={session} status={status} onCancel={() => void cancel()} onRefresh={() => void refreshStatus(session.session_id)} /> : null}
        {session && terminal ? <TerminalStatus status={status} /> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function DeviceSelect(props: { readonly devices: P115LoginDevice[]; readonly onChange: (value: string) => void; readonly value: string }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">登录设备类型</span>
      <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-ink" onChange={(event) => props.onChange(event.target.value)} value={props.value}>
        {props.devices.map((device) => <option key={device.value} value={device.value}>{device.label}{device.recommended ? '（推荐）' : ''}</option>)}
      </select>
    </label>
  );
}

function ActiveQrSession(props: {
  readonly cancelBusy: boolean;
  readonly onCancel: () => void;
  readonly onRefresh: () => void;
  readonly session: P115QrStart;
  readonly status: P115QrStatus | null;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <img alt="115 登录二维码" className="mx-auto h-48 w-48 rounded bg-white object-contain" src={props.session.qrcode_url} />
      <p className="mt-2 text-center text-sm text-slate-600" aria-live="polite">{props.status?.message ?? '等待扫码'}</p>
      <p className="mt-1 text-center text-xs text-slate-400">过期时间：{formatExpiry(props.session.expires_at)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm" disabled={props.cancelBusy} onClick={props.onRefresh} type="button"><RefreshCw size={16} />刷新状态</button>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-60" disabled={props.cancelBusy} onClick={props.onCancel} type="button">{props.cancelBusy ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}{props.cancelBusy ? '取消中' : '取消'}</button>
      </div>
    </div>
  );
}

function TerminalStatus({ status }: { readonly status: P115QrStatus | null }) {
  const succeeded = status?.status === 'succeeded';
  return (
    <div className={`rounded-md p-4 text-sm ${succeeded ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`} role="status">
      <p className="flex items-center gap-2 font-medium">{succeeded ? <CheckCircle size={18} /> : null}{status?.message ?? '扫码会话已结束'}</p>
      {succeeded && status?.account ? <p className="mt-2 text-xs">账号：{status.account.user_name ?? status.account.user_id ?? '未知'} · Cookie 已写入</p> : null}
      {!succeeded ? <p className="mt-2 text-xs">请重新生成二维码后继续。</p> : null}
    </div>
  );
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
