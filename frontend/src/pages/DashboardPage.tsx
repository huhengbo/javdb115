import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Cloud,
  Globe2,
  Loader2,
  Play,
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">系统状态 · {formatDateTime(lastRefreshedAt)}</p>
        </div>
        <button className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white disabled:opacity-60" disabled={isChecking} onClick={runCheck} type="button">
          {isChecking ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}{isChecking ? '检查中' : '立即检查'}
        </button>
      </div>
      {isChecking ? <InlineAlert className="mt-3">正在检查演员作品，完成后会自动刷新任务状态。</InlineAlert> : null}
      {error ? <InlineAlert className="mt-3" tone="danger">{error}</InlineAlert> : null}
      {!data ? <DashboardLoading /> : null}
      {data ? <StatusHero data={data} /> : null}
      {data ? <MetricsGrid data={data} /> : null}
      {data ? <ConnectionPanel data={data} onOpenSettings={onOpenSettings} /> : null}
      {data ? <AttentionPanel data={data} onChanged={refreshDashboard} /> : null}
      {data ? <StageOverview data={data} /> : null}
      {data ? (
        <section className="mt-6">
          <SectionHeader
            title="最近任务"
            description="首页只保留最近 3 条，完整历史在任务页查看"
            trailing={<button className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand" onClick={onOpenTasks} type="button">查看全部<ChevronRight size={16} /></button>}
          />
          <div className="mt-3"><TaskList tasks={data.recent_tasks.slice(0, 3)} onChanged={refreshDashboard} compact /></div>
        </section>
      ) : null}
    </section>
  );
}

function DashboardLoading() {
  return <div className="mt-4 grid gap-3" aria-live="polite"><div className="h-28 animate-pulse rounded-xl bg-slate-100" /><div className="grid grid-cols-3 gap-2"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /><div className="h-20 animate-pulse rounded-xl bg-slate-100" /><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></div></div>;
}

function StatusHero({ data }: { readonly data: Dashboard }) {
  const connectionsOk = data.connections.p115.ok && data.connections.javdb.ok;
  const healthy = connectionsOk && data.task_breakdown.attention === 0;
  return (
    <Surface className={`mt-4 p-4 ${healthy ? 'bg-emerald-50' : 'bg-amber-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`flex items-center gap-2 text-base font-semibold ${healthy ? 'text-emerald-700' : 'text-amber-800'}`}>
            {healthy ? <CheckCircle size={19} /> : <AlertTriangle size={19} />}
            {healthy ? '系统运行正常' : '有项目需要关注'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {healthy ? '115、JAVDB 与任务队列当前均无异常。' : `${data.task_breakdown.attention} 个任务需要处理，或外部集成存在异常。`}
          </p>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-slate-600">{Number(data.connections.p115.ok) + Number(data.connections.javdb.ok)}/2 集成正常</span>
      </div>
    </Surface>
  );
}

function ConnectionPanel({ data, onOpenSettings }: { readonly data: Dashboard; readonly onOpenSettings: () => void }) {
  const allOk = data.connections.p115.ok && data.connections.javdb.ok;
  return (
    <section className="mt-6">
      <SectionHeader title="集成健康" description={allOk ? '正常状态保持紧凑，异常时才展开细节' : '检测到外部集成异常，请检查配置'} />
      {allOk ? (
        <Surface className="mt-3 grid grid-cols-2 gap-2 p-2">
          <CompactConnection icon={<Cloud size={17} />} title="115" checkedAt={data.connections.p115.checked_at} />
          <CompactConnection icon={<Globe2 size={17} />} title="JAVDB" checkedAt={data.connections.javdb.checked_at} />
        </Surface>
      ) : (
        <div className="mt-3 grid gap-3"><P115Card status={data.connections.p115} onOpenSettings={onOpenSettings} /><JavdbCard status={data.connections.javdb} /></div>
      )}
    </section>
  );
}

function CompactConnection(props: { readonly icon: ReactNode; readonly title: string; readonly checkedAt: string | null }) {
  return <div className="flex min-h-14 items-center gap-2 rounded-lg bg-slate-50 px-3"><span className="text-brand">{props.icon}</span><span className="min-w-0"><span className="block text-sm font-semibold text-ink">{props.title} 正常</span><span className="block truncate text-xs text-slate-400">{formatDateTime(props.checkedAt)}</span></span></div>;
}

function P115Card({ status, onOpenSettings }: { readonly status: P115Status; readonly onOpenSettings: () => void }) {
  return (
    <ConnectionCard icon={<Cloud size={18} />} title="115 账号" caption="网盘认证与容量" ok={status.ok} message={status.message} checkedAt={status.checked_at}>
      {status.account ? <P115AccountDetails account={status.account} /> : null}
      {!status.ok ? <SettingsButton onOpenSettings={onOpenSettings} /> : null}
    </ConnectionCard>
  );
}

function JavdbCard({ status }: { readonly status: JavdbStatus }) {
  return <ConnectionCard icon={<Globe2 size={18} />} title="JAVDB 访问" caption="App API 可访问性" ok={status.ok} message={status.message} checkedAt={status.checked_at} />;
}

type ConnectionCardProps = {
  readonly caption: string;
  readonly checkedAt: string | null;
  readonly children?: ReactNode;
  readonly icon: ReactNode;
  readonly message: string;
  readonly ok: boolean;
  readonly title: string;
};

function ConnectionCard(props: ConnectionCardProps) {
  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><span className="rounded-lg bg-slate-50 p-2 text-brand">{props.icon}</span><span className="min-w-0"><span className="block font-semibold text-ink">{props.title}</span><span className="block text-xs text-slate-500">{props.caption}</span></span></div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${props.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-danger'}`}>{props.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{props.ok ? '正常' : '需处理'}</span>
      </div>
      <p className="mt-3 break-words text-sm text-slate-600">{props.message}</p>
      <p className="mt-2 text-xs text-slate-400">检测：{formatDateTime(props.checkedAt)}</p>
      {props.children ? <div className="mt-3 grid gap-2">{props.children}</div> : null}
    </Surface>
  );
}

function P115AccountDetails({ account }: { readonly account: P115Account }) {
  return <div className="grid gap-2 rounded-lg bg-slate-50 p-3"><InfoRow label="账号" value={account.user_name} /><InfoRow label="UID" value={account.user_id} /><InfoRow label="会员" value={account.vip_expires_at ? `${account.vip_label ?? 'VIP'} / ${account.vip_expires_at}` : account.vip_label} /><InfoRow label="空间" value={spaceSummary(account)} /></div>;
}

function AttentionPanel({ data, onChanged }: { readonly data: Dashboard; readonly onChanged: () => void }) {
  if (data.task_breakdown.attention === 0) return null;
  return (
    <section className="mt-6">
      <SectionHeader title="需要处理" description={`${data.task_breakdown.attention} 个任务处于失败或未完成状态`} />
      <div className="mt-3"><TaskList tasks={data.attention_tasks.slice(0, 3)} onChanged={onChanged} compact /></div>
    </section>
  );
}

function MetricsGrid({ data }: { readonly data: Dashboard }) {
  return <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="下载中" value={data.stats.downloading} /><Metric label="整理中" value={data.stats.organizing} /><Metric label="已完成" value={data.stats.completed} /></div>;
}

function StageOverview({ data }: { readonly data: Dashboard }) {
  const stages = Object.entries(data.task_breakdown.by_stage).filter(([, count]) => count > 0).slice(0, STAGE_LIMIT);
  if (stages.length === 0) return null;
  return <details className="mt-4 rounded-xl bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">查看阶段分布</summary><div className="mt-3 grid gap-2">{stages.map(([stage, count]) => <div className="flex items-center justify-between gap-3 text-sm" key={stage}><span className="min-w-0 truncate text-slate-500">{taskStageLabel(stage)}</span><span className="font-medium text-ink">{count}</span></div>)}</div></details>;
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) return null;
  return <p className="grid grid-cols-[4rem_1fr] gap-2 text-xs"><span className="text-slate-500">{label}</span><span className="min-w-0 break-words font-medium text-slate-700">{value}</span></p>;
}

function SettingsButton({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  return <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-medium text-ink" onClick={onOpenSettings} type="button"><Settings size={16} />去设置处理</button>;
}

function spaceSummary(account: P115Account): string | null {
  if (!account.space_total) return null;
  const used = account.space_used ? `已用 ${account.space_used}` : null;
  const remaining = account.space_remaining ? `剩余 ${account.space_remaining}` : null;
  return [used, remaining, `总计 ${account.space_total}`].filter(Boolean).join(' / ');
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <Surface className="p-3 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></Surface>;
}
