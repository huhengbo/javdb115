import { AlertTriangle, ChevronDown, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
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
import { EmptyState } from './ui';
import { TaskActionSheet } from './TaskActionSheet';
import { TaskCard } from './TaskCard';

type Props = {
  tasks: Task[];
  onChanged?: () => void;
  compact?: boolean;
};

export function TaskList({ tasks, onChanged, compact = false }: Props) {
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());
  const [actionTask, setActionTask] = useState<Task | null>(null);
  const deletion = useTaskDeletion((task) => {
    // Keep stale refresh/pagination responses from resurrecting deleted cards.
    setDeletedIds((current) => new Set([...current, task.id]));
    onChanged?.();
  });
  const visibleTasks = tasks.filter((task) => !deletedIds.has(task.id));
  const navigation = useMovieNavigation();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  if (visibleTasks.length === 0) return <EmptyState title="暂无任务" />;

  function toggleExpanded(id: number) {
    if (compact) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="quiet-list">
        {visibleTasks.map((task) => {
          const expanded = expandedIds.has(task.id);
          const failed = taskIssueKind(task) !== 'none' || task.status === 'failed';
          return (
            <TaskCard key={task.id} label={`任务 ${task.work?.code ?? task.id}`} className={compact ? '' : 'cursor-pointer'} onClick={() => toggleExpanded(task.id)} onActions={() => setActionTask(task)}>
              <div className="select-none py-3 [-webkit-touch-callout:none]">
                <TaskHeader compact={compact} expanded={expanded} task={task} onOpenMovie={navigation.openMovie} onActions={() => setActionTask(task)} />
                {!compact && task.status !== 'completed' ? <TaskProgress task={task} /> : null}
                {failed ? <div className="mt-3"><TaskIssueBlock task={task} compact={!expanded} /></div> : null}
                {!compact && task.status === 'failed' && !expanded ? <RetryButton taskId={task.id} onChanged={onChanged} /> : null}
              </div>
              {!compact && expanded ? (
                <div className="border-t border-line pb-4 pt-3" data-no-long-press>
                  <TaskDetails task={task} />
                  {task.status === 'failed' ? <RetryButton taskId={task.id} onChanged={onChanged} /> : null}
                  <DeleteButton task={task} onClick={() => deletion.open(task)} />
                </div>
              ) : null}
            </TaskCard>
          );
        })}
      </div>
      {actionTask ? <TaskActionSheet task={actionTask} onClose={() => setActionTask(null)} onDelete={() => { setActionTask(null); deletion.open(actionTask); }} /> : null}
      {deletion.task ? <ConfirmDialog danger busy={deletion.busy} confirmLabel="删除" description={<DeleteDescription error={deletion.error} task={deletion.task} />} title="删除任务记录" onCancel={deletion.close} onConfirm={deletion.confirm} /> : null}
    </>
  );
}

function useTaskDeletion(onDeleted: (task: Task) => void) {
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!task || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      await client.deleteTask(task.id);
      setTask(null);
      onDeleted(task);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
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

function TaskHeader(props: { readonly compact: boolean; readonly expanded: boolean; readonly task: Task; readonly onOpenMovie: (movieId: string) => void; readonly onActions: () => void }) {
  const movieId = movieIdFromSourceUrl(props.task.work?.source_url);
  const code = props.task.work?.code ?? `任务 #${props.task.id}`;
  const poster = <MoviePoster alt={code} className={`${props.compact ? 'h-16 w-11' : 'h-[4.5rem] w-[3.15rem]'} shrink-0 rounded-md`} src={props.task.work?.cover_url} />;

  function openMovie(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (movieId) props.onOpenMovie(movieId);
  }

  return (
    <div className="flex items-start gap-3">
      {movieId ? <button aria-label={`查看作品 ${code}`} className="shrink-0" onClick={openMovie} type="button">{poster}</button> : poster}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {movieId ? <button className="min-w-0 truncate text-left text-sm font-semibold text-ink hover:text-brand" onClick={openMovie} type="button">{code}</button> : <h3 className="min-w-0 truncate text-sm font-semibold text-ink">{code}</h3>}
          <StatusPill value={props.task.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.35rem] text-slate-500">{props.task.work?.title ?? taskStageLabel(props.task.stage)}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
          <span className="truncate">{formatRelativeTime(props.task.updated_at)}</span>
          {!props.compact ? <ChevronDown className={`shrink-0 transition-transform ${props.expanded ? 'rotate-180' : ''}`} size={15} /> : null}
        </div>
      </div>
      <button aria-label={`更多操作 ${code}`} aria-haspopup="dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); props.onActions(); }} type="button"><MoreHorizontal size={18} /></button>
    </div>
  );
}

function TaskProgress({ task }: { readonly task: Task }) {
  const step = Math.max(0, Math.min(4, taskProgressStep(task)));
  const width = `${(step / 4) * 100}%`;
  return <div className="mt-2.5 ml-[4.05rem]"><div className="h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width }} /></div><p className="mt-1 text-[11px] text-slate-400">{taskStageLabel(task.stage)}</p></div>;
}

function TaskDetails({ task }: { readonly task: Task }) {
  return (
    <div className="grid gap-1.5 break-words text-sm text-slate-500">
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
    <div className="rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">
      {issueKind !== 'none' ? <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={15} />{taskIssueLabel(task)}</p> : null}
      {taskRecoveryHint(task) ? <p className="mt-1 text-[13px] text-red-700">{taskRecoveryHint(task)}</p> : null}
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
  return <button aria-label={`删除任务 ${task.work?.code ?? task.id}`} className="mt-4 flex min-h-11 items-center gap-2 text-sm font-medium text-danger" onClick={(event) => { event.stopPropagation(); onClick(); }} type="button"><Trash2 size={16} />删除记录</button>;
}

function DeleteDescription({ error, task }: { readonly error: string | null; readonly task: Task }) {
  return <div className="space-y-2"><p>确认删除 {task.work?.code ?? `任务 #${task.id}`} 的本地任务记录？</p><p className="text-xs text-slate-500">不会取消 115 离线任务，也不会删除网盘文件。</p>{['pending', 'submitted', 'downloading', 'organizing'].includes(task.status) ? <p className="text-xs text-amber-700">删除后不再跟踪此任务，已开始的下载或整理不会撤销。</p> : null}{error ? <p className="rounded-md bg-red-50 p-2 text-xs text-danger" role="alert">{error}</p> : null}</div>;
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
      <button className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand disabled:opacity-60" disabled={isRetrying} onClick={(event) => { event.stopPropagation(); void retry(); }} type="button">{isRetrying ? <Loader2 className="animate-spin" size={16} /> : null}{isRetrying ? '重试中' : '手动重试'}</button>
      {error ? <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
