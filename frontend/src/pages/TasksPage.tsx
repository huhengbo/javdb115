import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { formatDateTime } from '../lib/tasks';
import type { Task } from '../types';

const TASK_REFRESH_INTERVAL_MS = 60_000;
const TASK_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'submitted', label: '已提交' },
  { value: 'downloading', label: '下载中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' }
] as const;

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const filteredTasks = useMemo(
    () => tasks.filter((task) => activeFilter === 'all' || task.status === activeFilter),
    [activeFilter, tasks]
  );

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">任务</h1>
          <p className="mt-1 text-sm text-slate-600">作品、磁力筛选、115 状态和整理状态</p>
          <p className="mt-1 text-xs text-slate-400">
            自动刷新：1 分钟 · 上次刷新：{formatDateTime(lastRefreshedAt)}
          </p>
        </div>
        <button
          aria-label="刷新任务列表"
          className="flex min-h-11 items-center justify-center rounded-md border border-line bg-white px-3 text-slate-600"
          onClick={refresh}
          type="button"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TASK_FILTERS.map((filter) => (
          <button
            className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${
              activeFilter === filter.value ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-line'
            }`}
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4">
        <TaskList tasks={filteredTasks} onChanged={refresh} />
      </div>
    </section>
  );
}
