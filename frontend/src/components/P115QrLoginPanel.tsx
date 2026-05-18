import { Loader2, QrCode, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { client } from '../api';
import type { P115LoginDevice, P115QrStart, P115QrStatus } from '../types';

const TERMINAL_STATUSES = new Set(['succeeded', 'expired', 'cancelled', 'failed']);

type Props = {
  readonly onSuccess: () => Promise<void>;
};

export function P115QrLoginPanel({ onSuccess }: Props) {
  const [devices, setDevices] = useState<P115LoginDevice[]>([]);
  const [device, setDevice] = useState('alipaymini');
  const [session, setSession] = useState<P115QrStart | null>(null);
  const [status, setStatus] = useState<P115QrStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.p115LoginDevices().then(setDevices).catch((err: Error) => setError(err.message));
  }, []);

  const refreshStatus = useCallback(async (sessionId: string) => {
    try {
      const next = await client.p115QrLoginStatus(sessionId);
      setStatus(next);
      if (next.status === 'succeeded') {
        await onSuccess();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [onSuccess]);

  useEffect(() => {
    if (!session || TERMINAL_STATUSES.has(status?.status ?? '')) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshStatus(session.session_id);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, session, status?.status]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const next = await client.startP115QrLogin(device);
      setSession(next);
      setStatus({ session_id: next.session_id, status: 'waiting', message: '等待扫码', account: null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!session) {
      return;
    }
    await client.cancelP115QrLogin(session.session_id);
    setSession(null);
    setStatus(null);
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
        <QrCode size={16} />
        115 扫码登录
      </h2>
      <p className="mt-1 text-xs text-slate-500">扫码成功后会自动写入 Cookie，随后回到目录分组选择下载和整理目录。</p>
      <div className="mt-3 grid gap-3">
        <DeviceSelect devices={devices} value={device} onChange={setDevice} />
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy} onClick={start} type="button">
          {busy ? <Loader2 className="animate-spin" size={16} /> : <QrCode size={16} />}
          生成二维码
        </button>
        {session ? <QrSession session={session} status={status} onCancel={cancel} onRefresh={() => refreshStatus(session.session_id)} /> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      </div>
    </section>
  );
}

function DeviceSelect(props: {
  readonly devices: P115LoginDevice[];
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">登录设备类型</span>
      <select className="mt-1 min-h-11 w-full rounded-md border border-line px-3" onChange={(event) => props.onChange(event.target.value)} value={props.value}>
        {props.devices.map((device) => (
          <option key={device.value} value={device.value}>
            {device.label}{device.recommended ? '（推荐）' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function QrSession(props: {
  readonly onCancel: () => void;
  readonly onRefresh: () => void;
  readonly session: P115QrStart;
  readonly status: P115QrStatus | null;
}) {
  return (
    <div className="rounded-md border border-line p-3">
      <img alt="115 登录二维码" className="mx-auto h-48 w-48 rounded bg-white object-contain" src={props.session.qrcode_url} />
      <p className="mt-2 text-center text-sm text-slate-600">{props.status?.message ?? '等待扫码'}</p>
      <p className="mt-1 text-center text-xs text-slate-400">过期时间：{props.session.expires_at}</p>
      {props.status?.account ? (
        <div className="mt-3 rounded-md bg-emerald-50 p-3 text-xs text-emerald-700">
          <p className="font-medium">已写入 Cookie</p>
          <p className="mt-1">账号：{props.status.account.user_name ?? props.status.account.user_id ?? '未知'}</p>
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm" onClick={props.onRefresh} type="button">
          <RefreshCw size={16} />
          刷新状态
        </button>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm" onClick={props.onCancel} type="button">
          <X size={16} />
          取消
        </button>
      </div>
    </div>
  );
}
