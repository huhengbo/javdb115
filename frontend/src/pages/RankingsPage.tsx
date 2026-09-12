import { Film, Loader2, Play, Trophy, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { actorLabel, imgUrl, type ActorRef } from '../lib/javdb';
import { useDetailHistory } from '../lib/useDetailHistory';
import type { Follow, Movie, RankingActor } from '../types';

const TOP250_PAGE_SIZE = 50;
const TOP250_MAX_PAGES = 5;
const TOP250_START_YEAR = 2008;

const BOARDS = [
  { value: 'movies', label: '作品', icon: Film },
  { value: 'playback', label: '热播', icon: Play },
  { value: 'actors', label: '演员', icon: Users },
  { value: 'top250', label: 'TOP250', icon: Trophy }
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
  const [topPage, setTopPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const followByActorId = useMemo(() => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])), [follows]);
  const { selectedMovie, selectedActor, activeOverlayKind, openMovie, closeMovie, openActor, closeActor } =
    useDetailHistory('rankings');

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
        setActors([]);
        setMovies(result);
      } else if (filters.board === 'playback') {
        const result = await client.rankingsPlayback(filters.period, filters.filterBy);
        if (seq !== requestSeq.current) return;
        setActors([]);
        setMovies(result);
      } else if (filters.board === 'actors') {
        const result = await client.rankingsActors(filters.category);
        if (seq !== requestSeq.current) return;
        setMovies([]);
        setActors(result);
      } else {
        const result = await client.moviesTop(1, TOP250_PAGE_SIZE, filters.topType, filters.topValue);
        if (seq !== requestSeq.current) return;
        setActors([]);
        setMovies(result);
        setHasMore(result.length === TOP250_PAGE_SIZE);
      }
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setMovies([]);
      setActors([]);
      setError((err as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  const loadMoreTop = useCallback(async () => {
    if (filters.board !== 'top250' || loading || loadingMore || !hasMore) {
      return;
    }
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

  useEffect(() => {
    writeFilters(filters);
  }, [filters]);
  useEffect(() => void loadRankings(), [loadRankings]);
  useEffect(() => void loadFollows(setFollows), []);
  useEffect(() => {
    const element = loaderRef.current;
    if (!element || filters.board !== 'top250') {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void loadMoreTop();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [filters.board, loadMoreTop]);

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">排行</h1>
      <BoardTabs board={filters.board} onChange={(board) => setFilters((current) => normalizeFilters({ ...current, board }))} />
      <RankingsFilters filters={filters} onChange={(next) => setFilters(normalizeFilters(next))} />
      {error ? (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">
          <p>{error}</p>
          <button className="mt-2 min-h-10 rounded-md bg-white px-3 text-xs font-medium text-ink ring-1 ring-line" onClick={() => void loadRankings()} type="button">
            重试
          </button>
        </div>
      ) : null}
      {loading ? <LoadingState /> : null}
      {!loading && !error && (filters.board === 'movies' || filters.board === 'playback' || filters.board === 'top250') ? (
        <MovieRankingList
          hasMore={filters.board === 'top250' && hasMore}
          loadingMore={loadingMore}
          loaderRef={loaderRef}
          movies={movies}
          onOpen={openMovie}
          showLoader={filters.board === 'top250'}
        />
      ) : null}
      {!loading && !error && filters.board === 'actors' ? <ActorRankingList actors={actors} onOpen={openActor} /> : null}
      {selectedMovie ? (
        <MovieDetailSheet
          isTop={activeOverlayKind === 'movie'}
          movieId={selectedMovie.id}
          onClose={closeMovie}
          onOpenActor={openActor}
          onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)}
        />
      ) : null}
      {selectedActor ? (
        <ActorDetailSheet
          actor={selectedActor.actor}
          follow={followByActorId[selectedActor.actor.id] ?? null}
          isTop={activeOverlayKind === 'actor'}
          onClose={closeActor}
          onOpenMovie={openMovie}
          onSaveFollow={(actor, tagIds, tagNames) => saveFollow(actor, tagIds, tagNames, setFollows)}
        />
      ) : null}
    </section>
  );
}

function BoardTabs(props: { readonly board: RankingBoard; readonly onChange: (board: RankingBoard) => void }) {
  return (
    <div className="mt-3 grid grid-cols-4 rounded-lg bg-slate-100 p-1">
      {BOARDS.map((board) => {
        const Icon = board.icon;
        return (
          <ModeButton
            active={props.board === board.value}
            icon={<Icon size={16} />}
            key={board.value}
            label={board.label}
            onClick={() => props.onChange(board.value)}
          />
        );
      })}
    </div>
  );
}

function ModeButton(props: { readonly active: boolean; readonly icon: ReactNode; readonly label: string; readonly onClick: () => void }) {
  return (
    <button className={`flex min-h-11 items-center justify-center gap-1 rounded-md text-xs font-medium sm:text-sm ${props.active ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`} onClick={props.onClick} type="button">
      {props.icon}
      {props.label}
    </button>
  );
}

function RankingsFilters(props: { readonly filters: RankingFilters; readonly onChange: (filters: RankingFilters) => void }) {
  const { filters, onChange } = props;
  const showCategory = filters.board === 'movies' || filters.board === 'actors' || filters.board === 'top250';
  const showPeriod = filters.board === 'movies' || filters.board === 'playback';
  const categories = filters.board === 'actors' ? CATEGORIES.filter((item) => item.value !== '3') : CATEGORIES;
  return (
    <div className="mt-3 space-y-2">
      {showCategory ? (
        <ChipRow>
          {filters.board === 'top250' ? (
            <Chip
              active={filters.topType === 'all'}
              label="全部"
              onClick={() => onChange({ ...filters, topType: 'all', topValue: '' })}
            />
          ) : null}
          {categories.map((option) => (
            <Chip
              active={categoryActive(filters, option.value)}
              key={option.value}
              label={option.label}
              onClick={() => onChange(selectCategory(filters, option.value))}
            />
          ))}
        </ChipRow>
      ) : null}
      {showPeriod ? (
        <ChipRow>
          {PERIODS.map((option) => (
            <Chip active={filters.period === option.value} key={option.value} label={option.label} onClick={() => onChange({ ...filters, period: option.value })} />
          ))}
        </ChipRow>
      ) : null}
      {filters.board === 'playback' ? (
        <ChipRow>
          {PLAYBACK_FILTERS.map((option) => (
            <Chip active={filters.filterBy === option.value} key={option.value} label={option.label} onClick={() => onChange({ ...filters, filterBy: option.value })} />
          ))}
        </ChipRow>
      ) : null}
      {filters.board === 'top250' ? (
        <ChipRow>
          {top250Years().map((year) => (
            <Chip
              active={filters.topType === 'year' && filters.topValue === String(year)}
              key={year}
              label={`${year}`}
              onClick={() => onChange({ ...filters, topType: 'year', topValue: String(year) })}
            />
          ))}
        </ChipRow>
      ) : null}
    </div>
  );
}

function ChipRow(props: { readonly children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1">{props.children}</div>;
}

function Chip(props: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.active ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-line'}`}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

function LoadingState() {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
      <Loader2 className="animate-spin" size={16} />
      加载中...
    </p>
  );
}

function MovieRankingList(props: {
  readonly movies: Movie[];
  readonly onOpen: (id: string) => void;
  readonly showLoader: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loaderRef: RefObject<HTMLDivElement | null>;
}) {
  if (props.movies.length === 0) {
    return <p className="mt-4 rounded-md border border-line bg-white p-3 text-sm text-slate-500">暂无作品排行</p>;
  }
  return (
    <div className="mt-4 space-y-3">
      {props.movies.map((movie, index) => (
        <MovieRankingCard key={movie.id} movie={movie} onOpen={() => props.onOpen(movie.id)} rank={movieRank(movie, index)} />
      ))}
      {props.showLoader ? (
        <div className="flex justify-center py-2" ref={props.loaderRef}>
          {props.loadingMore ? (
            <Loader2 className="animate-spin text-slate-400" size={20} />
          ) : props.hasMore ? (
            <span className="text-xs text-slate-300">上滑加载更多</span>
          ) : (
            <span className="text-xs text-slate-300">— 已加载全部 —</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MovieRankingCard(props: { readonly movie: Movie; readonly rank: number; readonly onOpen: () => void }) {
  return (
    <button className="flex w-full gap-3 rounded-lg border border-line bg-white p-3 text-left" onClick={props.onOpen} type="button">
      <span className="relative shrink-0">
        <RankBadge rank={props.rank} />
        <MoviePoster alt={props.movie.number} className="h-32 w-24 rounded" src={props.movie.thumb_url} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{props.movie.number}</span>
        <span className="mt-1 line-clamp-2 text-sm text-slate-600">{props.movie.title}</span>
        <span className="mt-2 block text-xs text-slate-500">
          {props.movie.release_date}
          {props.movie.score ? ` · ⭐ ${props.movie.score}` : ''}
        </span>
        <span className="mt-2 flex flex-wrap gap-1">
          {props.movie.has_cnsub ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">中字</span> : null}
          {props.movie.can_play ? <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-brand">可播放</span> : null}
        </span>
      </span>
    </button>
  );
}

function RankBadge(props: { readonly rank: number }) {
  const tone =
    props.rank === 1
      ? 'bg-amber-400 text-amber-950'
      : props.rank === 2
        ? 'bg-slate-300 text-slate-800'
        : props.rank === 3
          ? 'bg-orange-400 text-orange-950'
          : 'bg-slate-900/90 text-white';
  return <span className={`absolute left-1 top-1 z-10 flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${tone}`}>{props.rank}</span>;
}

function ActorRankingList(props: { readonly actors: RankingActor[]; readonly onOpen: (actor: ActorRef) => void }) {
  if (props.actors.length === 0) {
    return <p className="mt-4 rounded-md border border-line bg-white p-3 text-sm text-slate-500">暂无演员排行</p>;
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {props.actors.map((actor, index) => (
        <ActorRankingCard actor={actor} key={actor.id} onOpen={() => props.onOpen(rankingActorRef(actor))} rank={index + 1} />
      ))}
    </div>
  );
}

function ActorRankingCard(props: { readonly actor: RankingActor; readonly rank: number; readonly onOpen: () => void }) {
  const name = rankingActorName(props.actor);
  return (
    <button className="flex min-h-16 flex-col items-center rounded-lg border border-line bg-white p-3 text-center" onClick={props.onOpen} type="button">
      <span className="relative">
        <RankBadge rank={props.rank} />
        {props.actor.avatar_url ? (
          <img alt={name} className="h-20 w-20 rounded-full object-cover" decoding="async" loading="lazy" src={imgUrl(props.actor.avatar_url)} />
        ) : (
          <span className="block h-20 w-20 rounded-full bg-slate-100" />
        )}
      </span>
      <span className="mt-2 w-full truncate text-sm font-semibold text-ink">{name}</span>
      <span className="w-full truncate text-xs text-slate-500">{props.actor.name}</span>
    </button>
  );
}

function rankingActorName(actor: RankingActor): string {
  return actorLabel(actor.name_zht ?? '', actor.name ?? '');
}

function rankingActorRef(actor: RankingActor): ActorRef {
  return {
    id: actor.id,
    name: rankingActorName(actor),
    avatar_url: actor.avatar_url ?? '',
    profile_url: `https://javdb.com/actors/${actor.id}`
  };
}

function movieRank(movie: Movie, index: number): number {
  return movie.ranking ?? index + 1;
}

function categoryActive(filters: RankingFilters, category: Category): boolean {
  if (filters.board === 'top250') {
    return filters.topType === 'video_type' && filters.topValue === category;
  }
  return filters.category === category;
}

function selectCategory(filters: RankingFilters, category: Category): RankingFilters {
  if (filters.board === 'top250') {
    return { ...filters, topType: 'video_type', topValue: category };
  }
  return { ...filters, category };
}

function top250Years(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current; year >= TOP250_START_YEAR; year -= 1) {
    years.push(year);
  }
  return years;
}

function parseFilters(search: string): RankingFilters {
  const params = new URLSearchParams(search);
  return normalizeFilters({
    board: parseUnion(params.get('board'), BOARDS.map((item) => item.value), DEFAULT_FILTERS.board),
    category: parseUnion(params.get('type'), CATEGORIES.map((item) => item.value), DEFAULT_FILTERS.category),
    period: parseUnion(params.get('period'), PERIODS.map((item) => item.value), DEFAULT_FILTERS.period),
    filterBy: parseUnion(params.get('filter_by'), PLAYBACK_FILTERS.map((item) => item.value), DEFAULT_FILTERS.filterBy),
    topType: parseUnion(params.get('topType'), ['all', 'video_type', 'year'] as const, DEFAULT_FILTERS.topType),
    topValue: params.get('topValue') ?? ''
  });
}

function writeFilters(filters: RankingFilters) {
  const params = new URLSearchParams();
  params.set('board', filters.board);
  if (filters.board === 'movies' || filters.board === 'actors') {
    params.set('type', filters.category);
  }
  if (filters.board === 'movies' || filters.board === 'playback') {
    params.set('period', filters.period);
  }
  if (filters.board === 'playback') {
    params.set('filter_by', filters.filterBy);
  }
  if (filters.board === 'top250') {
    params.set('topType', filters.topType);
    if (filters.topValue) {
      params.set('topValue', filters.topValue);
    }
  }
  const next = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` === next) {
    return;
  }
  window.history.replaceState(window.history.state, '', next);
}

function normalizeFilters(filters: RankingFilters): RankingFilters {
  const category = filters.board === 'actors' && filters.category === '3' ? '0' : filters.category;
  const topValue = filters.topType === 'all' ? '' : filters.topValue;
  return { ...filters, category, topValue };
}

function parseUnion<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

async function loadFollows(setFollows: (follows: Follow[]) => void) {
  try {
    setFollows(await client.follows());
  } catch {
    setFollows([]);
  }
}

async function saveFollow(actor: ActorRef, tagIds: string[], tagNames: string[], setFollows: (follows: Follow[]) => void) {
  await client.createFollow({
    actor_external_id: actor.id,
    actor_name: actor.name,
    actor_profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`,
    actor_avatar_url: actor.avatar_url,
    selected_tag_ids: tagIds,
    selected_tag_names: tagNames
  });
  await loadFollows(setFollows);
}
