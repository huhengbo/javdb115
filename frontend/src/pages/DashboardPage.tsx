import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Cloud,
  Globe2,
  RefreshCw,
  Settings,
  XCircle
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { InlineAlert, SectionHeader, Surface } from '../components/ui';
import { formatDateTime, taskStageLabel } from '../lib/tasks';
import type { Dashboard, JavdbStatus, P115Account, P115Status } from '../types';

type Props = {
  readonly onOpenSettings: () => void;
  readonly onOpenTasks: () => void;
};

const DASHBOARD_REFRESH_INTERVAL_MS = 60_000;
const STAGE_LIMIT = 8;

export function DashboardPage({ onOpenSettings, onOpenTasks }: Props) {
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
    if (isChecking) return;
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
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{formatDateTime(lastRefreshedAt)}</p>
        <button aria-label="立即检查" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50" disabled={isChecking} onClick={runCheck} type="button">
          <RefreshCw className={isChecking ? 'animate-spin' : ''} size={18} />
        </button>
      </div>
      {error ? <InlineAlert className="mt-2" tone="danger">{error}</InlineAlert> : null}
      {!data ? <DashboardLoading /> : null}
      {data ? <StatusSummary data={data} /> : null}
      {data ? <MetricsGrid data={data} /> : null}
      {data ? <ConnectionPanel data={data} onOpenSettings={onOpenSettings} /> : null}
      {data ? <AttentionPanel data={data} onChanged={refreshDashboard} /> : null}
      {data ? <StageOverview data={data} /> : null}
      {data ? (
        <section className="mt-6">
          <SectionHeader title="最近任务" trailing={<button className="flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-brand" onClick={onOpenTasks} type="button">全部<ChevronRight size={16} /></button>} />
          <div className="mt-2"><TaskList tasks={data.recent_tasks.slice(0, 3)} onChanged={refreshDashboard} compact /></div>
        </section>
      ) : null}
    </section>
  );
}

function DashboardLoading() {
  return <div className="mt-3 space-y-4" aria-live="polite"><div className="h-6 w-32 animate-pulse rounded bg-slate-100" /><div className="grid grid-cols-3 gap-4"><div className="h-12 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /></div></div>;
}

function StatusSummary({ data }: { readonly data: Dashboard }) {
  const healthy = data.connections.p115.ok && data.connections.javdb.ok && data.task_breakdown.attention === 0;
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-b border-line pb-4">
      <p className={`flex items-center gap-2 text-sm font-semibold ${healthy ? 'text-emerald-700' : 'text-amber-800'}`}>
        <span className={`h-2 w-2 rounded-full ${healthy ? 'bg-emerald-600' : 'bg-amber-500'}`} />
        {healthy ? '运行正常' : '需要关注'}
      </p>
      {!healthy ? <span className="text-xs text-amber-800">{data.task_breakdown.attention} 个任务</span> : null}
    </div>
  );
}

function ConnectionPanel({ data, onOpenSettings }: { readonly data: Dashboard; readonly onOpenSettings: () => void }) {
  const allOk = data.connections.p115.ok && data.connections.javdb.ok;
  if (allOk) {
    return (
      <section className="mt-6">
        <SectionHeader title="连接" />
        <div className="quiet-list mt-2">
          <CompactConnection icon={<Cloud size={17} />} title="115" checkedAt={data.connections.p115.checked_at} />
          <CompactConnection icon={<Globe2 size={17} />} title="JAVDB" checkedAt={data.connections.javdb.checked_at} />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <SectionHeader title="连接" />
      <div className="mt-2 grid gap-3"><P115Card status={data.connections.p115} onOpenSettings={onOpenSettings} /><JavdbCard status={data.connections.javdb} /></div>
    </section>
  );
}

function CompactConnection(props: { readonly icon: ReactNode; readonly title: string; readonly checkedAt: string | null }) {
  return <div className="quiet-list-item flex min-h-12 items-center gap-3 py-2.5"><span className="text-slate-400">{props.icon}</span><span className="flex min-w-0 flex-1 items-center justify-between gap-3"><span className="text-sm font-medium text-ink">{props.title}</span><span className="text-xs text-slate-400">正常 · {formatDateTime(props.checkedAt)}</span></span></div>;
}

function P115Card({ status, onOpenSettings }: { readonly status: P115Status; readonly onOpenSettings: () => void }) {
  return (
    <ConnectionCard icon={<Cloud size={18} />} title="115 账号" ok={status.ok} message={status.message} checkedAt={status.checked_at}>
      {status.account ? <P115AccountDetails account={status.account} /> : null}
      {!status.ok ? <SettingsButton onOpenSettings={onOpenSettings} /> : null}
    </ConnectionCard>
  );
}

function JavdbCard({ status }: { readonly status: JavdbStatus }) {
  return <ConnectionCard icon={<Globe2 size={18} />} title="JAVDB" ok={status.ok} message={status.message} checkedAt={status.checked_at} />;
}

type ConnectionCardProps = {
  readonly checkedAt: string | null;
  readonly children?: ReactNode;
  readonly icon: ReactNode;
  readonly message: string;
  readonly ok: boolean;
  readonly title: string;
};

function ConnectionCard(props: ConnectionCardProps) {
  return (
    <Surface className={`p-4 ${props.ok ? '' : 'bg-red-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><span className="text-slate-400">{props.icon}</span><span className="font-semibold text-ink">{props.title}</span></div>
        <span className={`flex items-center gap-1 text-xs ${props.ok ? 'text-emerald-700' : 'text-danger'}`}>{props.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{props.ok ? '正常' : '异常'}</span>
      </div>
      <p className="mt-3 break-words text-sm text-slate-600">{props.message}</p>
      <p className="mt-2 text-xs text-slate-400">{formatDateTime(props.checkedAt)}</p>
      {props.children ? <div className="mt-3 grid gap-2">{props.children}</div> : null}
    </Surface>
  );
}

function P115AccountDetails({ account }: { readonly account: P115Account }) {
  return <div className="grid gap-2 border-t border-line pt-3"><InfoRow label="账号" value={account.user_name} /><InfoRow label="UID" value={account.user_id} /><InfoRow label="会员" value={account.vip_expires_at ? `${account.vip_label ?? 'VIP'} / ${account.vip_expires_at}` : account.vip_label} /><InfoRow label="空间" value={spaceSummary(account)} /></div>;
}

function AttentionPanel({ data, onChanged }: { readonly data: Dashboard; readonly onChanged: () => void }) {
  if (data.task_breakdown.attention === 0) return null;
  return (
    <section className="mt-6">
      <SectionHeader title="需要处理" trailing={<span className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle size={14} />{data.task_breakdown.attention}</span>} />
      <div className="mt-2"><TaskList tasks={data.attention_tasks.slice(0, 3)} onChanged={onChanged} compact /></div>
    </section>
  );
}

function MetricsGrid({ data }: { readonly data: Dashboard }) {
  return <div className="grid grid-cols-3 border-b border-line py-4"><Metric label="下载中" value={data.stats.downloading} /><Metric label="整理中" value={data.stats.organizing} /><Metric label="已完成" value={data.stats.completed} /></div>;
}

function StageOverview({ data }: { readonly data: Dashboard }) {
  const stages = Object.entries(data.task_breakdown.by_stage).filter(([, count]) => count > 0).slice(0, STAGE_LIMIT);
  if (stages.length === 0) return null;
  return <details className="mt-4 border-b border-line pb-3"><summary className="cursor-pointer py-2 text-sm text-slate-500">阶段分布</summary><div className="grid gap-2 py-2">{stages.map(([stage, count]) => <div className="flex items-center justify-between gap-3 text-sm" key={stage}><span className="min-w-0 truncate text-slate-500">{taskStageLabel(stage)}</span><span className="font-medium text-ink">{count}</span></div>)}</div></details>;
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) return null;
  return <p className="grid grid-cols-[4rem_1fr] gap-2 text-xs"><span className="text-slate-500">{label}</span><span className="min-w-0 break-words font-medium text-slate-700">{value}</span></p>;
}

function SettingsButton({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  return <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-ink" onClick={onOpenSettings} type="button"><Settings size={16} />设置</button>;
}

function spaceSummary(account: P115Account): string | null {
  if (!account.space_total) return null;
  const used = account.space_used ? `已用 ${account.space_used}` : null;
  const remaining = account.space_remaining ? `剩余 ${account.space_remaining}` : null;
  return [used, remaining, `总计 ${account.space_total}`].filter(Boolean).join(' / ');
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className="text-center"><p className="text-xl font-semibold text-ink">{value}</p><p className="mt-0.5 text-xs text-slate-500">{label}</p></div>;
}
