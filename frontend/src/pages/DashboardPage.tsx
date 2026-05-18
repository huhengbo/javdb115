import { CheckCircle, Cloud, Loader2, Play, Settings, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { formatDateTime } from '../lib/tasks';
import type { Dashboard, P115Account, P115Status } from '../types';

type Props = {
  readonly onOpenSettings: () => void;
};

const DASHBOARD_REFRESH_INTERVAL_MS = 60_000;

export function DashboardPage({ onOpenSettings }: Props) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const refreshDashboard = useCallback(() => {
    client.dashboard().then((payload) => {
      setData(payload);
      setLastRefreshedAt(new Date().toISOString());
      setError(null);
    }).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    refreshDashboard();
    const timer = window.setInterval(refreshDashboard, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshDashboard]);

  async function runCheck() {
    setError(null);
    setIsChecking(true);
    try {
      await client.runCheck();
      refreshDashboard();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">仪表盘</h1>
          <p className="mt-1 text-sm text-slate-600">自动提交、整理和失败状态</p>
          <p className="mt-1 text-xs text-slate-400">
            自动刷新：1 分钟 · 上次刷新：{formatDateTime(lastRefreshedAt)}
          </p>
        </div>
        <button className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-3 text-white disabled:opacity-60" disabled={isChecking} onClick={runCheck} type="button">
          {isChecking ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
          {isChecking ? '检查中' : '检查'}
        </button>
      </div>
      {isChecking ? <p className="mt-3 rounded-md border border-line bg-white p-3 text-sm text-slate-600">正在检查演员作品，页面会在完成后刷新任务状态。</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {data ? <ConnectionPanel data={data} onOpenSettings={onOpenSettings} /> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="已提交" value={data?.stats.submitted ?? 0} />
        <Metric label="下载中" value={data?.stats.downloading ?? 0} />
        <Metric label="已完成" value={data?.stats.completed ?? 0} />
        <Metric label="失败" value={data?.stats.failed ?? 0} />
      </div>
      <h2 className="mt-6 text-lg font-semibold text-ink">最近任务</h2>
      <div className="mt-3">
        <TaskList tasks={data?.recent_tasks ?? []} />
      </div>
    </section>
  );
}

function ConnectionPanel({ data, onOpenSettings }: { readonly data: Dashboard; readonly onOpenSettings: () => void }) {
  return (
    <section className="mt-4 rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">运行状态与账户</h2>
          <p className="mt-1 text-xs text-slate-500">首页打开时自动校验 115 账号与容量状态</p>
        </div>
        <ConnectionSummary data={data} />
      </div>
      <div className="mt-4">
        <P115Card status={data.connections.p115} onOpenSettings={onOpenSettings} />
      </div>
    </section>
  );
}

function ConnectionSummary({ data }: { readonly data: Dashboard }) {
  const okCount = Number(data.connections.p115.ok);
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
      {okCount}/1 正常
    </span>
  );
}

function P115Card({ status, onOpenSettings }: { readonly status: P115Status; readonly onOpenSettings: () => void }) {
  return (
    <ConnectionCard
      icon={<Cloud size={18} />}
      title="115 账号"
      caption="网盘认证与容量"
      ok={status.ok}
      message={status.message}
      onOpenSettings={onOpenSettings}
    >
      {status.account ? <P115AccountDetails account={status.account} /> : null}
    </ConnectionCard>
  );
}

type ConnectionCardProps = {
  readonly caption: string;
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly message: string;
  readonly ok: boolean;
  readonly onOpenSettings: () => void;
  readonly title: string;
};

function ConnectionCard(props: ConnectionCardProps) {
  const statusClass = props.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-danger';
  const borderClass = props.ok ? 'border-emerald-100' : 'border-red-100';
  return (
    <article className={`rounded-md border ${borderClass} bg-slate-50 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-white p-2 text-brand ring-1 ring-line">{props.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{props.title}</span>
            <span className="block text-xs text-slate-500">{props.caption}</span>
          </span>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${statusClass}`}>
          {props.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {props.ok ? '正常' : '需处理'}
        </span>
      </div>
      <p className="mt-3 break-words text-sm text-slate-700">{props.message}</p>
      <div className="mt-3 grid gap-2 rounded-md bg-white p-3 ring-1 ring-line">{props.children}</div>
      {!props.ok ? <SettingsButton onOpenSettings={props.onOpenSettings} /> : null}
    </article>
  );
}

function P115AccountDetails({ account }: { readonly account: P115Account }) {
  return (
    <>
      <InfoRow label="账号" value={account.user_name} />
      <InfoRow label="UID" value={account.user_id} />
      <InfoRow label="会员" value={account.vip_expires_at ? `${account.vip_label ?? 'VIP'} / ${account.vip_expires_at}` : account.vip_label} />
      <InfoRow label="空间" value={spaceSummary(account)} />
    </>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <p className="grid grid-cols-[4rem_1fr] gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-medium text-slate-700">{value}</span>
    </p>
  );
}

function SettingsButton({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  return (
    <button className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink" onClick={onOpenSettings} type="button">
      <Settings size={16} />
      去设置登录
    </button>
  );
}

function spaceSummary(account: P115Account): string | null {
  if (!account.space_total) {
    return null;
  }
  const used = account.space_used ? `已用 ${account.space_used}` : null;
  const remaining = account.space_remaining ? `剩余 ${account.space_remaining}` : null;
  return [used, remaining, `总计 ${account.space_total}`].filter(Boolean).join(' / ');
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
