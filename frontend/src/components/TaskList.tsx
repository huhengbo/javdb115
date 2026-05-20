import { StatusPill } from './StatusPill';
import { client } from '../api';
import { MoviePoster } from './MoviePoster';
import type { Task } from '../types';
import { formatDateTime, formatRelativeTime, taskElapsed, taskStageLabel } from '../lib/tasks';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

type Props = {
  tasks: Task[];
  onChanged?: () => void;
};

export function TaskList({ tasks, onChanged }: Props) {
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-line bg-white p-4 text-sm text-slate-500">暂无任务</p>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-lg border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <TaskPoster task={task} />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-ink">{task.work?.code ?? `任务 #${task.id}`}</h3>
              <p className="mt-1 text-sm text-slate-600">{task.work?.title ?? task.stage}</p>
              <p className="mt-1 text-xs text-slate-400">更新于 {formatRelativeTime(task.updated_at)}</p>
            </div>
            <StatusPill value={task.status} />
          </div>
          <div className="mt-3 grid gap-1 text-sm text-slate-600">
            <span>阶段：{taskStageLabel(task.stage)}</span>
            <span>创建：{formatDateTime(task.created_at)} · 更新：{formatDateTime(task.updated_at)}</span>
            <span>耗时：{taskElapsed(task)}</span>
            {task.status === 'failed' ? <span>失败时间：{formatDateTime(task.updated_at)}</span> : null}
            <span>演员：{actorText(task)}</span>
            <span>磁力：{task.magnet?.name ?? '未选择'}</span>
            {task.cloud_file_id ? <span>整理目录：{directoryLabel(task)}</span> : null}
            {task.error_message ? <span className="text-danger">错误：{task.error_message}</span> : null}
          </div>
          {task.status === 'failed' ? <RetryButton taskId={task.id} onChanged={onChanged} /> : null}
        </article>
      ))}
    </div>
  );
}

function TaskPoster({ task }: { readonly task: Task }) {
  return (
    <MoviePoster
      alt={task.work?.code ?? `任务 #${task.id}`}
      className="h-20 w-14 shrink-0 rounded"
      src={task.work?.cover_url}
    />
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

function RetryButton({ taskId, onChanged }: { taskId: number; onChanged?: () => void }) {
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
