import { Loader2, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../api';
import { TaskList } from '../components/TaskList';
import { FilterChip, InlineAlert } from '../components/ui';
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
const PRIMARY_FILTERS = new Set<TaskFilterValue>(['all', 'attention', 'completed']);
const PROGRESS_FILTERS = new Set<TaskFilterValue>(['submitted', 'downloading', 'organizing']);
const EMPTY_COUNTS = Object.fromEntries(TASK_FILTERS.map((filter) => [filter.value, 0])) as Record<TaskFilterValue, number>;

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
  const [filterSheet, setFilterSheet] = useState<'progress' | 'more' | null>(null);
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
    const visibleLimit = initial ? PAGE_SIZE : Math.min(Math.max(tasksRef.current.length, PAGE_SIZE), MAX_REFRESH_LIMIT);
    try {
      const payload = await client.tasks(requestedFilter, null, visibleLimit);
      if (activeFilterRef.current !== requestedFilter) return;
      const nextTasks = initial || replace ? payload.items : mergeRefreshedRange(payload.items, tasksRef.current);
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
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || !hasMore || loadingMore || loadMoreError || initialLoading || refreshing) return;
      void loadMore();
    }, { rootMargin: '320px 0px', threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadMore, loadMoreError, loadingMore, refreshing]);

  const activeLabel = useMemo(() => TASK_FILTERS.find((item) => item.value === activeFilter)?.label ?? '全部', [activeFilter]);
  const progressCount = filterCounts.submitted + filterCounts.downloading + filterCounts.organizing;

  function selectFilter(value: TaskFilterValue) {
    setActiveFilter(value);
    setFilterSheet(null);
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{activeLabel} · {total} 条</p>
          <p className="mt-0.5 text-xs text-slate-400">每分钟自动刷新 · {formatDateTime(lastRefreshedAt)}</p>
        </div>
        <button aria-label="刷新任务列表" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-line disabled:opacity-50" disabled={refreshing} onClick={() => void refresh(false, true)} type="button"><RefreshCw className={refreshing ? 'animate-spin' : ''} size={18} /></button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <FilterChip selected={activeFilter === 'all'} onClick={() => selectFilter('all')}>全部 {filterCounts.all}</FilterChip>
        <FilterChip selected={activeFilter === 'attention'} onClick={() => selectFilter('attention')}>需处理 {filterCounts.attention}</FilterChip>
        <FilterChip selected={PROGRESS_FILTERS.has(activeFilter)} onClick={() => setFilterSheet('progress')}>进行中 {progressCount}</FilterChip>
        <FilterChip selected={activeFilter === 'completed'} onClick={() => selectFilter('completed')}>已完成 {filterCounts.completed}</FilterChip>
        <button className={`filter-chip flex items-center gap-1 ${!PRIMARY_FILTERS.has(activeFilter) && !PROGRESS_FILTERS.has(activeFilter) ? 'filter-chip-selected' : ''}`} onClick={() => setFilterSheet('more')} type="button"><SlidersHorizontal size={14} />更多</button>
      </div>
      {error ? <InlineAlert className="mt-3" tone="danger">{error}</InlineAlert> : null}
      {initialLoading ? <TaskSkeleton /> : (
        <>
          {refreshing ? <p className="mt-3 text-xs text-slate-400" role="status">正在刷新当前任务状态…</p> : null}
          <div className="mt-3"><TaskList tasks={tasks} onChanged={() => void refresh(false, true)} /></div>
          <div className="mt-4 flex min-h-12 items-center justify-center" ref={loaderRef}>
            {loadingMore ? <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />加载更多任务</span> : loadMoreError ? <button className="min-h-11 rounded-xl bg-white px-4 text-sm font-medium text-ink ring-1 ring-line" onClick={() => void loadMore()} type="button">加载失败，点击重试</button> : hasMore ? <span className="py-3 text-xs text-slate-400">继续上滑加载</span> : total > 0 ? <span className="py-3 text-xs text-slate-400">已加载全部</span> : null}
          </div>
        </>
      )}
      {filterSheet ? <FilterSheet mode={filterSheet} activeFilter={activeFilter} counts={filterCounts} onClose={() => setFilterSheet(null)} onSelect={selectFilter} /> : null}
    </section>
  );
}

function FilterSheet(props: { readonly mode: 'progress' | 'more'; readonly activeFilter: TaskFilterValue; readonly counts: Record<TaskFilterValue, number>; readonly onClose: () => void; readonly onSelect: (value: TaskFilterValue) => void }) {
  const filters = props.mode === 'progress'
    ? TASK_FILTERS.filter((filter) => PROGRESS_FILTERS.has(filter.value))
    : TASK_FILTERS.filter((filter) => !PRIMARY_FILTERS.has(filter.value));
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-900/35" role="presentation" onClick={props.onClose}>
      <div aria-label={props.mode === 'progress' ? '进行中筛选' : '更多任务筛选'} aria-modal="true" className="ui-surface-elevated w-full rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-ink">{props.mode === 'progress' ? '进行中状态' : '更多筛选'}</h2><button aria-label="关闭筛选" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500" onClick={props.onClose} type="button"><X size={19} /></button></div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {filters.map((filter) => <button aria-pressed={props.activeFilter === filter.value} className={`min-h-12 rounded-xl px-3 text-left text-sm font-medium ${props.activeFilter === filter.value ? 'bg-teal-50 text-brand ring-1 ring-brand/20' : 'bg-slate-50 text-ink'}`} key={filter.value} onClick={() => props.onSelect(filter.value)} type="button"><span className="block">{filter.label}</span><span className="mt-0.5 block text-xs font-normal text-slate-400">{props.counts[filter.value]} 条</span></button>)}
        </div>
      </div>
    </div>
  );
}

function TaskSkeleton() {
  return <div className="mt-4 space-y-3" aria-live="polite">{Array.from({ length: 4 }, (_, index) => <div className="flex gap-3 rounded-xl bg-white p-4" key={index}><div className="h-20 w-14 animate-pulse rounded-lg bg-slate-100" /><div className="flex-1"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /><div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" /><div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div></div>)}</div>;
}

function mergeRefreshedRange(latest: Task[], current: Task[]): Task[] {
  if (latest.length === 0) return [];
  const latestIds = new Set(latest.map((task) => task.id));
  const refreshedBoundary = latest[latest.length - 1].id;
  const olderLoadedTasks = current.filter((task) => task.id < refreshedBoundary && !latestIds.has(task.id));
  return [...latest, ...olderLoadedTasks];
}

function appendUniqueTasks(current: Task[], incoming: Task[]): Task[] {
  const currentIds = new Set(current.map((task) => task.id));
  return [...current, ...incoming.filter((task) => !currentIds.has(task.id))];
}
