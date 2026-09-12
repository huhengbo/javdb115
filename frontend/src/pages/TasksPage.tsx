import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { formatDateTime } from '../lib/tasks';
import type { Task, TaskFilterValue } from '../types';

type TaskFilter = {
  readonly value: TaskFilterValue;
  readonly label: string;
};

const TASK_REFRESH_INTERVAL_MS = 60_000;
const PAGE_SIZE = 24;
const MAX_REFRESH_LIMIT = 200;
const TASK_FILTERS: readonly TaskFilter[] = [
  { value: 'all', label: '全部' },
  { value: 'attention', label: '需处理' },
  { value: 'submitted', label: '已提交' },
  { value: 'downloading', label: '下载中' },
  { value: 'organizing', label: '整理中' },
  { value: 'completed', label: '已完成' },
  { value: 'submit_failed', label: '提交失败' },
  { value: 'download_failed', label: '下载失败' },
  { value: 'organize_failed', label: '整理失败' },
  { value: 'incomplete_submit', label: '提交未完成' }
] as const;
const EMPTY_COUNTS = Object.fromEntries(
  TASK_FILTERS.map((filter) => [filter.value, 0])
) as Record<TaskFilterValue, number>;

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TaskFilterValue>('all');
  const [filterCounts, setFilterCounts] = useState<Record<TaskFilterValue, number>>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<Task[]>([]);
  const activeFilterRef = useRef<TaskFilterValue>(activeFilter);
  const refreshInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);

  const refresh = useCallback(async (initial = false, replace = false) => {
    if (!initial && (refreshInFlight.current || loadMoreInFlight.current)) return;
    refreshInFlight.current = true;
    if (initial) setInitialLoading(true);
    else setRefreshing(true);
    setError(null);
    const requestedFilter = activeFilter;
    const visibleLimit = initial
      ? PAGE_SIZE
      : Math.min(Math.max(tasksRef.current.length, PAGE_SIZE), MAX_REFRESH_LIMIT);
    try {
      const payload = await client.tasks(requestedFilter, null, visibleLimit);
      if (activeFilterRef.current !== requestedFilter) return;
      const nextTasks = initial || replace
        ? payload.items
        : mergeRefreshedRange(payload.items, tasksRef.current);
      tasksRef.current = nextTasks;
      setTasks(nextTasks);
      setFilterCounts(payload.counts);
      setTotal(payload.total);
      if (initial || replace) {
        setNextCursor(payload.next_cursor);
        setHasMore(payload.has_more);
      } else {
        setHasMore(nextTasks.length < payload.total);
      }
      setLoadMoreError(null);
      setLastRefreshedAt(new Date().toISOString());
    } catch (err) {
      if (activeFilterRef.current === requestedFilter) setError((err as Error).message);
    } finally {
      refreshInFlight.current = false;
      if (activeFilterRef.current === requestedFilter) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeFilter]);

  const loadMore = useCallback(async () => {
    if (!hasMore || nextCursor === null || loadMoreInFlight.current || refreshInFlight.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const requestedFilter = activeFilter;
    try {
      const payload = await client.tasks(requestedFilter, nextCursor, PAGE_SIZE);
      if (activeFilterRef.current !== requestedFilter) return;
      const nextTasks = appendUniqueTasks(tasksRef.current, payload.items);
      tasksRef.current = nextTasks;
      setTasks(nextTasks);
      setFilterCounts(payload.counts);
      setTotal(payload.total);
      setNextCursor(payload.next_cursor);
      setHasMore(payload.has_more);
    } catch (err) {
      if (activeFilterRef.current === requestedFilter) setLoadMoreError((err as Error).message);
    } finally {
      loadMoreInFlight.current = false;
      if (activeFilterRef.current === requestedFilter) setLoadingMore(false);
    }
  }, [activeFilter, hasMore, nextCursor]);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
    tasksRef.current = [];
    setTasks([]);
    setTotal(0);
    setNextCursor(null);
    setHasMore(false);
    setLoadMoreError(null);
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), TASK_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeFilter, refresh]);

  useEffect(() => {
    const element = loaderRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !hasMore || loadingMore || loadMoreError || initialLoading || refreshing) return;
        void loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadMore, loadMoreError, loadingMore, refreshing]);

  return (
    <section>
      <TasksHeader
        lastRefreshedAt={lastRefreshedAt}
        refreshing={refreshing}
        onRefresh={() => void refresh(false, true)}
      />
      <FilterBar activeFilter={activeFilter} counts={filterCounts} onChange={setActiveFilter} />
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {initialLoading ? (
        <p className="mt-4 flex min-h-24 items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm text-slate-500" aria-live="polite"><Loader2 className="animate-spin" size={18} />任务加载中...</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-500">当前显示 {tasks.length} / {total} 条任务{refreshing ? ' · 正在刷新' : ''}</p>
          <div className="mt-3"><TaskList tasks={tasks} onChanged={() => void refresh(false, true)} /></div>
          <div className="mt-4 flex min-h-12 items-center justify-center" ref={loaderRef}>
            {loadingMore ? (
              <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />加载中...</span>
            ) : loadMoreError ? (
              <button className="min-h-11 rounded-md border border-line bg-white px-4 text-sm text-ink" onClick={() => void loadMore()} type="button">加载失败，点击重试</button>
            ) : hasMore ? (
              <button className="min-h-11 rounded-md px-4 text-sm text-slate-500" onClick={() => void loadMore()} type="button">上滑加载更多</button>
            ) : total > 0 ? (
              <span className="py-3 text-xs text-slate-400">— 已加载全部 —</span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function TasksHeader(props: { readonly lastRefreshedAt: string | null; readonly refreshing: boolean; readonly onRefresh: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink">任务</h1>
        <p className="mt-1 text-sm text-slate-600">作品、磁力筛选、115 状态和整理状态</p>
        <p className="mt-1 text-xs text-slate-400">自动刷新：1 分钟 · 上次刷新：{formatDateTime(props.lastRefreshedAt)}</p>
      </div>
      <button aria-label="刷新任务列表" className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-white px-3 text-slate-600 disabled:opacity-50" disabled={props.refreshing} onClick={props.onRefresh} type="button">
        <RefreshCw className={props.refreshing ? 'animate-spin' : ''} size={18} />
      </button>
    </div>
  );
}

function FilterBar(props: { readonly activeFilter: TaskFilterValue; readonly counts: Record<TaskFilterValue, number>; readonly onChange: (value: TaskFilterValue) => void }) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {TASK_FILTERS.map((filter) => (
        <button aria-pressed={props.activeFilter === filter.value} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.activeFilter === filter.value ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-line'}`} key={filter.value} onClick={() => props.onChange(filter.value)} type="button">
          {filter.label} {props.counts[filter.value]}
        </button>
      ))}
    </div>
  );
}

function mergeRefreshedRange(latest: Task[], current: Task[]): Task[] {
  if (latest.length === 0) return [];
  const latestIds = new Set(latest.map((task) => task.id));
  const refreshedBoundary = latest[latest.length - 1].id;
  const olderLoadedTasks = current.filter(
    (task) => task.id < refreshedBoundary && !latestIds.has(task.id)
  );
  return [...latest, ...olderLoadedTasks];
}

function appendUniqueTasks(current: Task[], incoming: Task[]): Task[] {
  const currentIds = new Set(current.map((task) => task.id));
  return [...current, ...incoming.filter((task) => !currentIds.has(task.id))];
}
