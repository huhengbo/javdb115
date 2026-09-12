import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { client } from '../api';
import { movieIdFromSourceUrl } from '../lib/javdb';
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
import { ConfirmDialog } from './discovery/ConfirmDialog';
import { useMovieNavigation } from './discovery/MovieDetailNavigator';
import { MoviePoster } from './MoviePoster';
import { StatusPill } from './StatusPill';

type Props = {
  tasks: Task[];
  onChanged?: () => void;
};

const TIMELINE_STEPS = ['提交', '下载', '整理', '完成'] as const;

export function TaskList({ tasks, onChanged }: Props) {
  const deletion = useTaskDeletion(onChanged);
  const navigation = useMovieNavigation();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  if (tasks.length === 0) {
    return <p className="rounded-lg border border-line bg-white p-4 text-sm text-slate-500">暂无任务</p>;
  }

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.map((task) => {
          const expanded = expandedIds.has(task.id);
          return (
            <article key={task.id} className="rounded-lg border border-line bg-white p-4">
              <TaskHeader task={task} onOpenMovie={navigation.openMovie} />
              <TaskTimeline task={task} />
              <TaskIssueBlock task={task} compact={!expanded} />
              {task.status === 'failed' ? <RetryButton taskId={task.id} onChanged={onChanged} /> : null}
              <button
                aria-expanded={expanded}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-md text-sm text-slate-500 active:bg-slate-50"
                onClick={() => toggleExpanded(task.id)}
                type="button"
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {expanded ? '收起详情' : '查看详情'}
              </button>
              {expanded ? (
                <div className="border-t border-line pt-3">
                  <TaskDetails task={task} />
                  <DeleteButton task={task} onClick={() => deletion.open(task)} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {deletion.task ? (
        <ConfirmDialog
          danger
          busy={deletion.busy}
          confirmLabel="删除"
          description={<DeleteDescription error={deletion.error} task={deletion.task} />}
          title="删除任务记录"
          onCancel={deletion.close}
          onConfirm={deletion.confirm}
        />
      ) : null}
    </>
  );
}

function useTaskDeletion(onChanged?: () => void) {
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!task || busy) return;
    setError(null);
    setBusy(true);
    try {
      await client.deleteTask(task.id);
      setTask(null);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function open(nextTask: Task) {
    setError(null);
    setTask(nextTask);
  }

  function close() {
    if (!busy) setTask(null);
  }

  return { busy, close, confirm, error, open, task };
}

function TaskHeader({ task, onOpenMovie }: { readonly task: Task; readonly onOpenMovie: (movieId: string) => void }) {
  const movieId = movieIdFromSourceUrl(task.work?.source_url);
  const openMovie = () => {
    if (movieId) onOpenMovie(movieId);
  };
  const poster = <MoviePoster alt={task.work?.code ?? `任务 #${task.id}`} className="h-20 w-14 shrink-0 rounded" src={task.work?.cover_url} />;

  return (
    <div className="flex items-start gap-3">
      {movieId ? (
        <button aria-label={`查看作品 ${task.work?.code ?? task.id}`} className="shrink-0 rounded active:scale-[0.98]" onClick={openMovie} type="button">
          {poster}
        </button>
      ) : poster}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {movieId ? (
            <button className="min-w-0 truncate text-left text-base font-semibold text-ink underline-offset-2 hover:text-brand hover:underline active:text-brand" onClick={openMovie} type="button">
              {task.work?.code ?? `任务 #${task.id}`}
            </button>
          ) : (
            <h3 className="min-w-0 truncate text-base font-semibold text-ink">{task.work?.code ?? `任务 #${task.id}`}</h3>
          )}
          <StatusPill value={task.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.work?.title ?? taskStageLabel(task.stage)}</p>
        <p className="mt-1 text-xs text-slate-500">{taskStageLabel(task.stage)} · 更新于 {formatRelativeTime(task.updated_at)}</p>
      </div>
    </div>
  );
}

function TaskTimeline({ task }: { readonly task: Task }) {
  const activeStep = taskProgressStep(task);
  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5">
      {TIMELINE_STEPS.map((step, index) => {
        const reached = activeStep > index;
        return (
          <div className="min-w-0" key={step}>
            <div className={`h-1 rounded-full ${reached ? 'bg-brand' : 'bg-slate-200'}`} />
            <p className={`mt-1 text-center text-[11px] ${reached ? 'font-medium text-brand' : 'text-slate-400'}`}>
              {reached ? <Check className="mr-0.5 inline" size={11} /> : null}{step}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetails({ task }: { readonly task: Task }) {
  return (
    <div className="grid gap-1.5 break-words text-sm text-slate-600">
      <span>创建：{formatDateTime(task.created_at)}</span>
      <span>更新：{formatDateTime(task.updated_at)}</span>
      <span>耗时：{taskElapsed(task)}</span>
      <span>演员：{actorText(task)}</span>
      <span>磁力：{task.magnet?.name ?? '未选择'}</span>
      {task.cloud_file_id ? <span>整理目录：{directoryLabel(task)}</span> : null}
      {task.error_message ? <span className="text-xs text-danger">原始错误：{task.error_message}</span> : null}
    </div>
  );
}

function TaskIssueBlock({ task, compact }: { readonly task: Task; readonly compact: boolean }) {
  const issueKind = taskIssueKind(task);
  if (issueKind === 'none' && !task.error_message) return null;
  return (
    <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">
      {issueKind !== 'none' ? <p className="flex items-center gap-1 font-medium"><AlertTriangle size={15} />{taskIssueLabel(task)}</p> : null}
      {taskRecoveryHint(task) ? <p className="mt-1 text-red-700">{taskRecoveryHint(task)}</p> : null}
      {!compact && task.error_message ? <p className="mt-2 break-words text-xs">原始错误：{task.error_message}</p> : null}
    </div>
  );
}

function actorText(task: Task): string {
  if (task.actor?.name) return task.actor.name;
  return task.work?.actors.length ? task.work.actors.join('、') : '未知';
}

function directoryLabel(task: Task): string {
  return task.cloud_file_name || task.work?.code || task.cloud_file_id || '';
}

function DeleteButton({ task, onClick }: { readonly task: Task; readonly onClick: () => void }) {
  return (
    <button aria-label={`删除任务 ${task.work?.code ?? task.id}`} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-red-100 px-3 text-sm font-medium text-danger" onClick={onClick} type="button">
      <Trash2 size={16} />删除记录
    </button>
  );
}

function DeleteDescription({ error, task }: { readonly error: string | null; readonly task: Task }) {
  return (
    <div className="space-y-2">
      <p>确认删除 {task.work?.code ?? `任务 #${task.id}`} 的本地任务记录？</p>
      <p className="text-xs text-slate-500">这不会取消 115 离线任务，也不会删除 115 网盘文件。</p>
      {error ? <p className="rounded-md bg-red-50 p-2 text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

function RetryButton({ taskId, onChanged }: { readonly taskId: number; readonly onChanged?: () => void }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (isRetrying) return;
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
      <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-3 disabled:opacity-60" disabled={isRetrying} onClick={() => void retry()} type="button">
        {isRetrying ? <Loader2 className="animate-spin" size={16} /> : null}{isRetrying ? '重试中' : '手动重试'}
      </button>
      {error ? <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
