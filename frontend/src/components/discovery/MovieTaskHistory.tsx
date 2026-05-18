import type { Task, TaskHistoryItem } from '../../types';
import { formatDateTime, taskStageLabel, taskStatusLabel } from '../../lib/tasks';

type Props = {
  readonly error: string | null;
  readonly items: TaskHistoryItem[];
  readonly loading: boolean;
};

export function MovieTaskHistory({ error, items, loading }: Props) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-medium text-ink">任务历史</h3>
      {loading ? <p className="mt-2 rounded-md border border-line p-3 text-sm text-slate-500">任务历史加载中...</p> : null}
      {error ? <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-2 rounded-md border border-line p-3 text-sm text-slate-500">本地还没有这个作品的任务记录</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="mt-2 space-y-2">
          {items.map((item) => <HistoryCard item={item} key={item.task.id} />)}
        </div>
      ) : null}
    </section>
  );
}

export function taskSummary(task: Task): string {
  const segments = [
    `状态：${task.status}`,
    `阶段：${taskStageLabel(task.stage)}`,
    task.magnet?.name ? `磁力：${task.magnet.name}` : null,
    task.cloud_file_id ? `目录：${directoryLabel(task)}` : null,
    task.error_message ? `错误：${task.error_message}` : null
  ].filter(Boolean);
  return segments.join('\n');
}

function HistoryCard({ item }: { readonly item: TaskHistoryItem }) {
  const task = item.task;
  return (
    <article className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">任务 #{task.id}</p>
          <p className="mt-1 text-xs text-slate-500">更新：{formatDateTime(task.updated_at)}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{taskStatusLabel(task.status)}</span>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-600">
        <span>阶段：{taskStageLabel(task.stage)}</span>
        <span>创建：{formatDateTime(task.created_at)}</span>
        {task.magnet?.name ? <span className="break-all">磁力：{task.magnet.name}</span> : null}
        {task.cloud_task_id ? <span className="break-all">115 任务：{task.cloud_task_id}</span> : null}
        {task.cloud_file_id ? <span className="break-all">整理目录：{directoryLabel(task)}</span> : null}
        {task.error_message ? <span className="text-danger">错误：{task.error_message}</span> : null}
      </div>
      {item.events.length > 0 ? <EventTimeline item={item} /> : null}
    </article>
  );
}

function directoryLabel(task: Task): string {
  return task.cloud_file_name || task.work?.code || task.cloud_file_id || '';
}

function EventTimeline({ item }: { readonly item: TaskHistoryItem }) {
  return (
    <div className="mt-3 border-t border-line pt-2">
      {item.events.map((event) => (
        <p className="text-xs text-slate-500" key={event.id}>
          {formatDateTime(event.created_at)} · {taskStageLabel(event.to_stage)}
          {event.message ? ` · ${event.message}` : ''}
        </p>
      ))}
    </div>
  );
}
