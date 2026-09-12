import { Filter, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { EmptyState, FilterChip, InlineAlert } from '../components/ui';
import { actorLabel, imgUrl, type ActorRef } from '../lib/javdb';
import { useDetailHistory } from '../lib/useDetailHistory';
import type { Follow, Movie, RankingActor } from '../types';

const TOP250_PAGE_SIZE = 50;
const TOP250_MAX_PAGES = 5;
const TOP250_START_YEAR = 2008;

const BOARDS = [
  { value: 'movies', label: '作品' },
  { value: 'playback', label: '热播' },
  { value: 'actors', label: '演员' },
  { value: 'top250', label: 'TOP250' }
] as const;

const CATEGORIES = [
  { value: '0', label: '有码' },
  { value: '1', label: '无码' },
  { value: '2', label: '欧美' },
  { value: '3', label: 'FC2' }
] as const;

const PERIODS = [
  { value: 'daily', label: '日榜' },
  { value: 'weekly', label: '周榜' },
  { value: 'monthly', label: '月榜' }
] as const;

const PLAYBACK_FILTERS = [
  { value: 'high_score', label: '高分' },
  { value: 'all', label: '全部' }
] as const;

type RankingBoard = (typeof BOARDS)[number]['value'];
type Category = (typeof CATEGORIES)[number]['value'];
type Period = (typeof PERIODS)[number]['value'];
type PlaybackFilter = (typeof PLAYBACK_FILTERS)[number]['value'];
type TopType = 'all' | 'video_type' | 'year';

type RankingFilters = {
  board: RankingBoard;
  category: Category;
  period: Period;
  filterBy: PlaybackFilter;
  topType: TopType;
  topValue: string;
};

const DEFAULT_FILTERS: RankingFilters = {
  board: 'movies',
  category: '0',
  period: 'daily',
  filterBy: 'high_score',
  topType: 'all',
  topValue: ''
};

export function RankingsPage() {
  const [filters, setFilters] = useState<RankingFilters>(() => parseFilters(window.location.search));
  const [movies, setMovies] = useState<Movie[]>([]);
  const [actors, setActors] = useState<RankingActor[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [topPage, setTopPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const followByActorId = useMemo(() => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])), [follows]);
  const { selectedMovie, selectedActor, activeOverlayKind, openMovie, closeMovie, openActor, closeActor } = useDetailHistory('rankings');

  const loadRankings = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setHasMore(false);
    setTopPage(1);
    try {
      if (filters.board === 'movies') {
        const result = await client.rankings(filters.category, filters.period);
        if (seq !== requestSeq.current) return;
        setActors([]); setMovies(result);
      } else if (filters.board === 'playback') {
        const result = await client.rankingsPlayback(filters.period, filters.filterBy);
        if (seq !== requestSeq.current) return;
        setActors([]); setMovies(result);
      } else if (filters.board === 'actors') {
        const result = await client.rankingsActors(filters.category);
        if (seq !== requestSeq.current) return;
        setMovies([]); setActors(result);
      } else {
        const result = await client.moviesTop(1, TOP250_PAGE_SIZE, filters.topType, filters.topValue);
        if (seq !== requestSeq.current) return;
        setActors([]); setMovies(result); setHasMore(result.length === TOP250_PAGE_SIZE);
      }
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setMovies([]); setActors([]); setError((err as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  const loadMoreTop = useCallback(async () => {
    if (filters.board !== 'top250' || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = topPage + 1;
      const result = await client.moviesTop(nextPage, TOP250_PAGE_SIZE, filters.topType, filters.topValue);
      setMovies((current) => [...current, ...result]);
      setTopPage(nextPage);
      setHasMore(result.length === TOP250_PAGE_SIZE && nextPage < TOP250_MAX_PAGES);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [filters, hasMore, loading, loadingMore, topPage]);

  useEffect(() => { writeFilters(filters); }, [filters]);
  useEffect(() => void loadRankings(), [loadRankings]);
  useEffect(() => void loadFollows(setFollows), []);
  useEffect(() => {
    const element = loaderRef.current;
    if (!element || filters.board !== 'top250') return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMoreTop(); }, { rootMargin: '320px 0px', threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [filters.board, loadMoreTop]);

  return (
    <section>
      <BoardTabs board={filters.board} onChange={(board) => setFilters((current) => normalizeFilters({ ...current, board }))} />
      <div className="flex items-center justify-between gap-2 border-b border-line py-2">
        <p className="min-w-0 truncate text-xs text-slate-500">{filterSummary(filters)}</p>
        <button className="flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-brand" onClick={() => setFilterOpen(true)} type="button"><Filter size={15} />筛选</button>
      </div>
      {error ? <InlineAlert className="mt-3" tone="danger"><p>{error}</p><button className="mt-2 min-h-11 text-xs font-medium text-brand" onClick={() => void loadRankings()} type="button">重试</button></InlineAlert> : null}
      {loading ? <LoadingState board={filters.board} /> : null}
      {!loading && !error && (filters.board === 'movies' || filters.board === 'playback' || filters.board === 'top250') ? <MovieRankingList hasMore={filters.board === 'top250' && hasMore} loadingMore={loadingMore} loaderRef={loaderRef} movies={movies} onOpen={openMovie} showLoader={filters.board === 'top250'} /> : null}
      {!loading && !error && filters.board === 'actors' ? <ActorRankingList actors={actors} onOpen={openActor} /> : null}
      {filterOpen ? <RankingFilterSheet filters={filters} onChange={(next) => setFilters(normalizeFilters(next))} onClose={() => setFilterOpen(false)} /> : null}
      {selectedMovie ? <MovieDetailSheet isTop={activeOverlayKind === 'movie'} movieId={selectedMovie.id} onClose={closeMovie} onOpenActor={openActor} onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)} /> : null}
      {selectedActor ? <ActorDetailSheet actor={selectedActor.actor} follow={followByActorId[selectedActor.actor.id] ?? null} isTop={activeOverlayKind === 'actor'} onClose={closeActor} onOpenMovie={openMovie} onSaveFollow={(actor, tagIds, tagNames) => saveFollow(actor, tagIds, tagNames, setFollows)} /> : null}
    </section>
  );
}

function BoardTabs(props: { readonly board: RankingBoard; readonly onChange: (board: RankingBoard) => void }) {
  return (
    <div className="grid grid-cols-4 border-b border-line">
      {BOARDS.map((board) => <button aria-pressed={props.board === board.value} className={`relative min-h-11 text-sm font-medium ${props.board === board.value ? 'text-ink' : 'text-slate-500'}`} key={board.value} onClick={() => props.onChange(board.value)} type="button">{board.label}{props.board === board.value ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" /> : null}</button>)}
    </div>
  );
}

function RankingFilterSheet(props: { readonly filters: RankingFilters; readonly onChange: (filters: RankingFilters) => void; readonly onClose: () => void }) {
  const { filters, onChange } = props;
  const showCategory = filters.board === 'movies' || filters.board === 'actors' || filters.board === 'top250';
  const showPeriod = filters.board === 'movies' || filters.board === 'playback';
  const categories = filters.board === 'actors' ? CATEGORIES.filter((item) => item.value !== '3') : CATEGORIES;
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-900/35" role="presentation" onClick={props.onClose}>
      <div aria-label="排行筛选" aria-modal="true" className="ui-surface-elevated max-h-[78dvh] w-full overflow-y-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-ink">筛选</h2><button aria-label="关闭筛选" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500" onClick={props.onClose} type="button"><X size={19} /></button></div>
        <div className="mt-3 space-y-4">
          {showCategory ? <FilterSection title={filters.board === 'top250' ? '类型' : '分类'}><div className="flex flex-wrap gap-2">{filters.board === 'top250' ? <FilterChip selected={filters.topType === 'all'} onClick={() => onChange({ ...filters, topType: 'all', topValue: '' })}>全部</FilterChip> : null}{categories.map((option) => <FilterChip selected={categoryActive(filters, option.value)} key={option.value} onClick={() => onChange(selectCategory(filters, option.value))}>{option.label}</FilterChip>)}</div></FilterSection> : null}
          {showPeriod ? <FilterSection title="周期"><div className="flex flex-wrap gap-2">{PERIODS.map((option) => <FilterChip selected={filters.period === option.value} key={option.value} onClick={() => onChange({ ...filters, period: option.value })}>{option.label}</FilterChip>)}</div></FilterSection> : null}
          {filters.board === 'playback' ? <FilterSection title="热播范围"><div className="flex flex-wrap gap-2">{PLAYBACK_FILTERS.map((option) => <FilterChip selected={filters.filterBy === option.value} key={option.value} onClick={() => onChange({ ...filters, filterBy: option.value })}>{option.label}</FilterChip>)}</div></FilterSection> : null}
          {filters.board === 'top250' ? <FilterSection title="年份"><div className="flex flex-wrap gap-2">{top250Years().map((year) => <FilterChip selected={filters.topType === 'year' && filters.topValue === String(year)} key={year} onClick={() => onChange({ ...filters, topType: 'year', topValue: String(year) })}>{year}</FilterChip>)}</div></FilterSection> : null}
        </div>
        <button className="mt-5 min-h-11 w-full rounded-lg bg-brand px-4 text-sm font-medium text-white" onClick={props.onClose} type="button">完成</button>
      </div>
    </div>
  );
}

function FilterSection(props: { readonly title: string; readonly children: ReactNode }) { return <section><h3 className="mb-2 text-sm font-semibold text-ink">{props.title}</h3>{props.children}</section>; }

function filterSummary(filters: RankingFilters): string {
  if (filters.board === 'movies') return `${categoryLabel(filters.category)} · ${periodLabel(filters.period)}`;
  if (filters.board === 'playback') return `${periodLabel(filters.period)} · ${filters.filterBy === 'high_score' ? '高分' : '全部'}`;
  if (filters.board === 'actors') return categoryLabel(filters.category);
  if (filters.topType === 'all') return '全部类型 · 全年份';
  if (filters.topType === 'year') return `年份 ${filters.topValue}`;
  return categoryLabel(filters.topValue as Category);
}

function categoryLabel(value: Category): string { return CATEGORIES.find((item) => item.value === value)?.label ?? '全部'; }
function periodLabel(value: Period): string { return PERIODS.find((item) => item.value === value)?.label ?? '日榜'; }

function LoadingState({ board }: { readonly board: RankingBoard }) {
  if (board === 'actors') return <div className="mt-4 grid grid-cols-2 gap-5" aria-live="polite">{Array.from({ length: 6 }, (_, index) => <div className="h-28 animate-pulse rounded-lg bg-slate-100" key={index} />)}</div>;
  return <div className="quiet-list mt-3" aria-live="polite">{Array.from({ length: 5 }, (_, index) => <div className="quiet-list-item flex gap-3 py-3" key={index}><div className="h-24 w-[4.25rem] animate-pulse rounded-md bg-slate-100" /><div className="flex-1"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /><div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" /><div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div></div>)}</div>;
}

function MovieRankingList(props: { readonly movies: Movie[]; readonly onOpen: (id: string) => void; readonly showLoader: boolean; readonly hasMore: boolean; readonly loadingMore: boolean; readonly loaderRef: RefObject<HTMLDivElement | null> }) {
  if (props.movies.length === 0) return <div className="mt-4"><EmptyState title="暂无作品排行" /></div>;
  return (
    <div className="quiet-list mt-3">
      {props.movies.map((movie, index) => <MovieRankingRow key={movie.id} movie={movie} onOpen={() => props.onOpen(movie.id)} rank={movieRank(movie, index)} />)}
      {props.showLoader ? <div className="flex min-h-14 items-center justify-center" ref={props.loaderRef}>{props.loadingMore ? <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />加载中</span> : props.hasMore ? <span className="text-xs text-slate-400">继续上滑</span> : <span className="text-xs text-slate-400">已加载全部</span>}</div> : null}
    </div>
  );
}

function MovieRankingRow(props: { readonly movie: Movie; readonly rank: number; readonly onOpen: () => void }) {
  return (
    <button className="quiet-list-item flex w-full gap-3 py-3 text-left" onClick={props.onOpen} type="button">
      <span className="w-6 shrink-0 pt-1 text-center text-sm font-semibold text-slate-400">{props.rank}</span>
      <MoviePoster alt={props.movie.number} className="h-24 w-[4.25rem] shrink-0 rounded-md" src={props.movie.thumb_url} />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{props.movie.number}</span><span className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-600">{props.movie.title}</span><span className="mt-2 block text-xs text-slate-400">{props.movie.release_date}{props.movie.score ? ` · ⭐ ${props.movie.score}` : ''}</span><span className="mt-1 block text-xs text-slate-500">{[props.movie.has_cnsub ? '中字' : '', props.movie.can_play ? '可播放' : ''].filter(Boolean).join(' · ')}</span></span>
    </button>
  );
}

function ActorRankingList(props: { readonly actors: RankingActor[]; readonly onOpen: (actor: ActorRef) => void }) {
  if (props.actors.length === 0) return <div className="mt-4"><EmptyState title="暂无演员排行" /></div>;
  return <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6">{props.actors.map((actor, index) => <ActorRankingItem actor={actor} key={actor.id} onOpen={() => props.onOpen(rankingActorRef(actor))} rank={index + 1} />)}</div>;
}

function ActorRankingItem(props: { readonly actor: RankingActor; readonly rank: number; readonly onOpen: () => void }) {
  const name = rankingActorName(props.actor);
  return (
    <button className="min-w-0 text-center" onClick={props.onOpen} type="button">
      <span className="relative mx-auto block w-fit"><span className="absolute -left-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900/85 px-1 text-[11px] font-semibold text-white">{props.rank}</span>{props.actor.avatar_url ? <img alt={name} className="h-20 w-20 rounded-full object-cover" decoding="async" loading="lazy" src={imgUrl(props.actor.avatar_url)} /> : <span className="block h-20 w-20 rounded-full bg-slate-100" />}</span>
      <span className="mt-2 block truncate text-sm font-semibold text-ink">{name}</span><span className="block truncate text-xs text-slate-500">{props.actor.name}</span>
    </button>
  );
}

function rankingActorName(actor: RankingActor): string { return actorLabel(actor.name_zht ?? '', actor.name ?? ''); }
function rankingActorRef(actor: RankingActor): ActorRef { return { id: actor.id, name: rankingActorName(actor), avatar_url: actor.avatar_url ?? '', profile_url: `https://javdb.com/actors/${actor.id}` }; }
function movieRank(movie: Movie, index: number): number { return movie.ranking ?? index + 1; }

function categoryActive(filters: RankingFilters, category: Category): boolean {
  if (filters.board === 'top250') return filters.topType === 'video_type' && filters.topValue === category;
  return filters.category === category;
}

function selectCategory(filters: RankingFilters, category: Category): RankingFilters {
  if (filters.board === 'top250') return { ...filters, topType: 'video_type', topValue: category };
  return { ...filters, category };
}

function top250Years(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current; year >= TOP250_START_YEAR; year -= 1) years.push(year);
  return years;
}

function parseFilters(search: string): RankingFilters {
  const params = new URLSearchParams(search);
  return normalizeFilters({ board: parseUnion(params.get('board'), BOARDS.map((item) => item.value), DEFAULT_FILTERS.board), category: parseUnion(params.get('type'), CATEGORIES.map((item) => item.value), DEFAULT_FILTERS.category), period: parseUnion(params.get('period'), PERIODS.map((item) => item.value), DEFAULT_FILTERS.period), filterBy: parseUnion(params.get('filter_by'), PLAYBACK_FILTERS.map((item) => item.value), DEFAULT_FILTERS.filterBy), topType: parseUnion(params.get('topType'), ['all', 'video_type', 'year'] as const, DEFAULT_FILTERS.topType), topValue: params.get('topValue') ?? '' });
}

function writeFilters(filters: RankingFilters) {
  const params = new URLSearchParams();
  params.set('board', filters.board);
  if (filters.board === 'movies' || filters.board === 'actors') params.set('type', filters.category);
  if (filters.board === 'movies' || filters.board === 'playback') params.set('period', filters.period);
  if (filters.board === 'playback') params.set('filter_by', filters.filterBy);
  if (filters.board === 'top250') { params.set('topType', filters.topType); if (filters.topValue) params.set('topValue', filters.topValue); }
  const next = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` === next) return;
  window.history.replaceState(window.history.state, '', next);
}

function normalizeFilters(filters: RankingFilters): RankingFilters {
  const category = filters.board === 'actors' && filters.category === '3' ? '0' : filters.category;
  const topValue = filters.topType === 'all' ? '' : filters.topValue;
  return { ...filters, category, topValue };
}

function parseUnion<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T { return allowed.find((item) => item === value) ?? fallback; }

async function loadFollows(setFollows: (follows: Follow[]) => void) {
  try { setFollows(await client.follows()); } catch { setFollows([]); }
}

async function saveFollow(actor: ActorRef, tagIds: string[], tagNames: string[], setFollows: (follows: Follow[]) => void) {
  await client.createFollow({ actor_external_id: actor.id, actor_name: actor.name, actor_profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`, actor_avatar_url: actor.avatar_url, selected_tag_ids: tagIds, selected_tag_names: tagNames });
  await loadFollows(setFollows);
}
