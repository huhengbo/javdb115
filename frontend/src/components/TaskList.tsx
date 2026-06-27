import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { client } from '../api';
import {
  formatDateTime,
  formatRelativeTime,
  taskElapsed,
  taskIssueKind,
  taskIssueLabel,
  taskProgressStep,
  taskRecoveryHint,
  taskStageLabel
} from '../lib/tasks';
import type { Task } from '../types';
import { MoviePoster } from './MoviePoster';
import { StatusPill } from './StatusPill';

type Props = {
  tasks: Task[];
  onChanged?: () => void;
};

const TIMELINE_STEPS = ['提交', '下载', '整理', '完成'] as const;

export function TaskList({ tasks, onChanged }: Props) {
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-line bg-white p-4 text-sm text-slate-500">暂无任务</p>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-lg border border-line bg-white p-4">
          <TaskHeader task={task} />
          <TaskTimeline task={task} />
          <TaskDetails task={task} />
          <TaskIssueBlock task={task} />
          {task.status === 'failed' ? <RetryButton taskId={task.id} onChanged={onChanged} /> : null}
        </article>
      ))}
    </div>
  );
}

function TaskHeader({ task }: { readonly task: Task }) {
  return (
    <div className="flex items-start gap-3">
      <MoviePoster
        alt={task.work?.code ?? `任务 #${task.id}`}
        className="h-20 w-14 shrink-0 rounded"
        src={task.work?.cover_url}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-ink">{task.work?.code ?? `任务 #${task.id}`}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.work?.title ?? taskStageLabel(task.stage)}</p>
        <p className="mt-1 text-xs text-slate-400">更新于 {formatRelativeTime(task.updated_at)}</p>
      </div>
      <StatusPill value={task.status} />
    </div>
  );
}

function TaskTimeline({ task }: { readonly task: Task }) {
  const activeStep = taskProgressStep(task);
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {TIMELINE_STEPS.map((step, index) => {
        const reached = activeStep > index;
        return (
          <div className="min-w-0" key={step}>
            <div className={`h-1 rounded-full ${reached ? 'bg-brand' : 'bg-slate-200'}`} />
            <p className={`mt-1 text-center text-xs ${reached ? 'font-medium text-brand' : 'text-slate-400'}`}>
              {reached ? <Check className="mr-0.5 inline" size={12} /> : null}
              {step}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetails({ task }: { readonly task: Task }) {
  return (
    <div className="mt-3 grid gap-1 text-sm text-slate-600">
      <span>阶段：{taskStageLabel(task.stage)}</span>
      <span>创建：{formatDateTime(task.created_at)} · 更新：{formatDateTime(task.updated_at)}</span>
      <span>耗时：{taskElapsed(task)}</span>
      <span>演员：{actorText(task)}</span>
      <span>磁力：{task.magnet?.name ?? '未选择'}</span>
      {task.cloud_file_id ? <span>整理目录：{directoryLabel(task)}</span> : null}
    </div>
  );
}

function TaskIssueBlock({ task }: { readonly task: Task }) {
  const issueKind = taskIssueKind(task);
  if (issueKind === 'none' && !task.error_message) {
    return null;
  }
  return (
    <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">
      {issueKind !== 'none' ? (
        <p className="flex items-center gap-1 font-medium">
          <AlertTriangle size={15} />
          {taskIssueLabel(task)}
        </p>
      ) : null}
      {taskRecoveryHint(task) ? <p className="mt-1 text-red-700">{taskRecoveryHint(task)}</p> : null}
      {task.error_message ? <p className="mt-2 break-words text-xs">原始错误：{task.error_message}</p> : null}
    </div>
  );
}

function actorText(task: Task): string {
  if (task.actor?.name) {
    return task.actor.name;
  }
  return task.work?.actors.length ? task.work.actors.join('、') : '未知';
}

function directoryLabel(task: Task): string {
  return task.cloud_file_name || task.work?.code || task.cloud_file_id || '';
}

function RetryButton({ taskId, onChanged }: { readonly taskId: number; readonly onChanged?: () => void }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setError(null);
    setIsRetrying(true);
    try {
      await client.retryTask(taskId);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-3 disabled:opacity-60"
        disabled={isRetrying}
        onClick={retry}
        type="button"
      >
        {isRetrying ? <Loader2 className="animate-spin" size={16} /> : null}
        {isRetrying ? '重试中' : '手动重试'}
      </button>
      {error ? <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
