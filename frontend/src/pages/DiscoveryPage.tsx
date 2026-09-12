import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { EmptyState, FilterChip, InlineAlert, SectionHeader } from '../components/ui';
import { useDetailHistory } from '../lib/useDetailHistory';
import type { Follow, Movie } from '../types';
import type { ActorRef } from '../lib/javdb';

const GENRES = [
  { key: 'can_play', label: '可播放' },
  { key: 'magnets', label: '有磁力' }
] as const;
const PAGE_SIZE = 24;

export function DiscoveryPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [filter, setFilter] = useState('can_play');
  const [page, setPage] = useState(1);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[] | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestSeq = useRef(0);
  const searchSeq = useRef(0);
  const { selectedMovie, selectedActor, activeOverlayKind, openMovie, closeMovie, openActor, closeActor } =
    useDetailHistory('discovery');

  const followByActorId = useMemo(
    () => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])),
    [follows]
  );

  const loadMovies = useCallback(async (nextFilter: string, nextPage: number, append: boolean) => {
    const seq = ++latestSeq.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await client.moviesLatest(nextFilter, nextPage, PAGE_SIZE);
      if (seq !== latestSeq.current) return false;
      setMovies((current) => append ? mergeMovies(current, result) : result);
      setHasMore(result.length === PAGE_SIZE);
      setPage(nextPage);
      setFailedPage(null);
      return true;
    } catch (err) {
      if (seq === latestSeq.current) {
        setError((err as Error).message);
        if (append) setFailedPage(nextPage);
      }
      return false;
    } finally {
      if (seq === latestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  async function loadFollows() {
    try {
      setFollows(await client.follows());
    } catch {
      setFollows([]);
    }
  }

  useEffect(() => {
    searchSeq.current += 1;
    setSearchResults(null);
    setFailedPage(null);
    void loadMovies(filter, 1, false);
  }, [filter, loadMovies]);

  useEffect(() => {
    void loadFollows();
  }, []);

  useEffect(() => {
    const element = loaderRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !hasMore || loading || loadingMore || searchResults || failedPage) return;
        void loadMovies(filter, page + 1, true);
      },
      { rootMargin: '320px 0px', threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [failedPage, filter, hasMore, loadMovies, loading, loadingMore, page, searchResults]);

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query || searchLoading) return;
    const seq = ++searchSeq.current;
    setSearchLoading(true);
    setError(null);
    searchInputRef.current?.blur();
    try {
      const result = await client.search(query);
      if (seq === searchSeq.current) setSearchResults(result);
    } catch (err) {
      if (seq === searchSeq.current) setError((err as Error).message);
    } finally {
      if (seq === searchSeq.current) setSearchLoading(false);
    }
  }

  function clearSearch() {
    searchSeq.current += 1;
    setSearchLoading(false);
    setSearchQuery('');
    setSearchResults(null);
    setError(null);
  }

  async function saveFollow(actor: ActorRef, tagIds: string[], tagNames: string[]) {
    await client.createFollow({
      actor_external_id: actor.id,
      actor_name: actor.name,
      actor_profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`,
      actor_avatar_url: actor.avatar_url,
      selected_tag_ids: tagIds,
      selected_tag_names: tagNames
    });
    await loadFollows();
  }

  return (
    <section>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 -mt-4 bg-mist/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <form className="flex overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line" onSubmit={(event) => { event.preventDefault(); void handleSearch(); }}>
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="discovery-search">搜索番号或演员名</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              autoCapitalize="none"
              autoCorrect="off"
              className="min-h-12 w-full bg-transparent pl-10 pr-11 text-sm text-ink outline-none placeholder:text-slate-400"
              enterKeyHint="search"
              id="discovery-search"
              placeholder="搜索番号、演员名..."
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
              }}
            />
            {searchQuery ? (
              <button aria-label="清空搜索" className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center text-slate-400" onClick={clearSearch} type="button"><X size={17} /></button>
            ) : null}
          </div>
          <button aria-label="搜索作品" className="flex min-h-12 min-w-14 items-center justify-center bg-brand px-4 text-sm font-medium text-white disabled:opacity-50" disabled={searchLoading || !searchQuery.trim()} type="submit">
            {searchLoading ? <Loader2 className="animate-spin" size={17} /> : '搜索'}
          </button>
        </form>
        {!searchResults ? <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{GENRES.map((genre) => <FilterChip key={genre.key} selected={filter === genre.key} onClick={() => setFilter(genre.key)}>{genre.label}</FilterChip>)}</div> : null}
      </div>
      {error ? <InlineAlert className="mt-3" tone="danger">{error}</InlineAlert> : null}
      <div className="mt-3">
        <SectionHeader title={searchResults ? `搜索结果 · ${searchResults.length}` : '最新作品'} trailing={searchResults ? <button className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand" onClick={clearSearch} type="button">返回最新</button> : undefined} />
        {loading ? (
          <MovieGridSkeleton />
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
              {(searchResults ?? movies).map((movie) => <MovieCard key={movie.id} movie={movie} onClick={() => openMovie(movie.id)} />)}
            </div>
            {(searchResults ?? movies).length === 0 ? <div className="mt-4"><EmptyState title={searchResults ? '没有找到匹配作品' : '暂无最新作品'} description={searchResults ? '试试更短的番号或演员名。' : '稍后再来看看。'} /></div> : null}
            {!searchResults ? (
              <div className="mt-4 flex min-h-14 items-center justify-center" ref={loaderRef}>
                {loadingMore ? <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />加载更多作品</span> : failedPage ? <button className="min-h-11 rounded-xl bg-white px-4 text-sm font-medium text-ink ring-1 ring-line" onClick={() => void loadMovies(filter, failedPage, true)} type="button">加载失败，点击重试</button> : hasMore ? <span className="py-3 text-xs text-slate-400">继续上滑加载</span> : <span className="py-3 text-xs text-slate-400">已加载全部</span>}
              </div>
            ) : null}
          </>
        )}
      </div>
      {selectedMovie ? <MovieDetailSheet isTop={activeOverlayKind === 'movie'} movieId={selectedMovie.id} onClose={closeMovie} onOpenActor={openActor} onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)} /> : null}
      {selectedActor ? <ActorDetailSheet actor={selectedActor.actor} follow={followByActorId[selectedActor.actor.id] ?? null} isTop={activeOverlayKind === 'actor'} onClose={closeActor} onOpenMovie={openMovie} onSaveFollow={saveFollow} /> : null}
    </section>
  );
}

function mergeMovies(current: Movie[], incoming: Movie[]): Movie[] {
  const seen = new Set(current.map((movie) => movie.id));
  return [...current, ...incoming.filter((movie) => !seen.has(movie.id))];
}

function MovieCard(props: { readonly movie: Movie; readonly onClick: () => void }) {
  return (
    <button className="group min-w-0 rounded-xl bg-white p-1.5 text-left shadow-sm ring-1 ring-transparent transition hover:shadow-md active:scale-[0.985]" onClick={props.onClick} type="button">
      <MoviePoster alt={props.movie.number} className="w-full rounded-lg" src={props.movie.thumb_url} />
      <div className="px-1 pb-1 pt-2">
        <p className="truncate text-sm font-semibold text-ink">{props.movie.number}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.35rem] text-slate-500">{props.movie.title}</p>
        <p className="mt-1 text-xs text-slate-400">{props.movie.release_date}</p>
      </div>
    </button>
  );
}

function MovieGridSkeleton() {
  return <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">{Array.from({ length: 6 }, (_, index) => <div className="animate-pulse" key={index}><div className="aspect-[2/3] rounded-xl bg-slate-100" /><div className="mt-2 h-4 w-2/3 rounded bg-slate-100" /><div className="mt-2 h-3 w-full rounded bg-slate-100" /></div>)}</div>;
}
