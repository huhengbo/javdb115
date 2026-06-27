import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { formatDateTime, taskIssueKind } from '../lib/tasks';
import type { Task } from '../types';

type TaskFilterValue =
  | 'all'
  | 'attention'
  | 'submitted'
  | 'downloading'
  | 'organizing'
  | 'completed'
  | 'submit_failed'
  | 'download_failed'
  | 'organize_failed'
  | 'incomplete_submit';

type TaskFilter = {
  readonly value: TaskFilterValue;
  readonly label: string;
  readonly match: (task: Task) => boolean;
};

const TASK_REFRESH_INTERVAL_MS = 60_000;
const TASK_FILTERS: readonly TaskFilter[] = [
  { value: 'all', label: '全部', match: () => true },
  { value: 'attention', label: '需处理', match: isAttentionTask },
  { value: 'submitted', label: '已提交', match: (task) => task.status === 'submitted' },
  { value: 'downloading', label: '下载中', match: (task) => task.status === 'downloading' },
  { value: 'organizing', label: '整理中', match: (task) => task.status === 'organizing' },
  { value: 'completed', label: '已完成', match: (task) => task.status === 'completed' },
  { value: 'submit_failed', label: '提交失败', match: (task) => taskIssueKind(task) === 'submit_failed' },
  { value: 'download_failed', label: '下载失败', match: (task) => taskIssueKind(task) === 'download_failed' },
  { value: 'organize_failed', label: '整理失败', match: isOrganizeFailure },
  { value: 'incomplete_submit', label: '提交未完成', match: (task) => taskIssueKind(task) === 'incomplete_submit' }
] as const;

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TaskFilterValue>('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const activeFilterConfig = TASK_FILTERS.find((filter) => filter.value === activeFilter) ?? TASK_FILTERS[0];
  const filteredTasks = useMemo(
    () => tasks.filter(activeFilterConfig.match),
    [activeFilterConfig, tasks]
  );
  const filterCounts = useMemo(() => countFilters(tasks), [tasks]);

  const refresh = useCallback(() => {
    setError(null);
    client.tasks().then((payload) => {
      setTasks(payload);
      setLastRefreshedAt(new Date().toISOString());
    }).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, TASK_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section>
      <TasksHeader lastRefreshedAt={lastRefreshedAt} onRefresh={refresh} />
      <FilterBar
        activeFilter={activeFilter}
        counts={filterCounts}
        onChange={setActiveFilter}
      />
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        当前显示 {filteredTasks.length} / {tasks.length} 条任务
      </p>
      <div className="mt-3">
        <TaskList tasks={filteredTasks} onChanged={refresh} />
      </div>
    </section>
  );
}

function TasksHeader(props: { readonly lastRefreshedAt: string | null; readonly onRefresh: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink">任务</h1>
        <p className="mt-1 text-sm text-slate-600">作品、磁力筛选、115 状态和整理状态</p>
        <p className="mt-1 text-xs text-slate-400">
          自动刷新：1 分钟 · 上次刷新：{formatDateTime(props.lastRefreshedAt)}
        </p>
      </div>
      <button
        aria-label="刷新任务列表"
        className="flex min-h-11 items-center justify-center rounded-md border border-line bg-white px-3 text-slate-600"
        onClick={props.onRefresh}
        type="button"
      >
        <RefreshCw size={18} />
      </button>
    </div>
  );
}

function FilterBar(props: {
  readonly activeFilter: TaskFilterValue;
  readonly counts: Record<TaskFilterValue, number>;
  readonly onChange: (value: TaskFilterValue) => void;
}) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {TASK_FILTERS.map((filter) => (
        <button
          className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${
            props.activeFilter === filter.value ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-line'
          }`}
          key={filter.value}
          onClick={() => props.onChange(filter.value)}
          type="button"
        >
          {filter.label} {props.counts[filter.value]}
        </button>
      ))}
    </div>
  );
}

function countFilters(tasks: Task[]): Record<TaskFilterValue, number> {
  return TASK_FILTERS.reduce((counts, filter) => ({
    ...counts,
    [filter.value]: tasks.filter(filter.match).length
  }), {} as Record<TaskFilterValue, number>);
}

function isAttentionTask(task: Task): boolean {
  return task.status === 'failed' || task.status === 'organizing';
}

function isOrganizeFailure(task: Task): boolean {
  const issueKind = taskIssueKind(task);
  return issueKind === 'organize_failed' || issueKind === 'directory_error' || issueKind === 'missing_video';
}
