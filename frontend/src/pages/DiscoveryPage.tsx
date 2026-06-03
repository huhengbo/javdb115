import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { useDetailHistory } from '../lib/useDetailHistory';
import type { Follow, Movie } from '../types';
import type { ActorRef } from '../lib/javdb';

const GENRES = [
  { key: 'can_play', label: '可播放' },
  { key: 'magnets', label: '有磁力' }
] as const;

export function DiscoveryPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [filter, setFilter] = useState('can_play');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[] | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const { selectedMovie, selectedActor, activeOverlayKind, openMovie, closeMovie, openActor, closeActor } =
    useDetailHistory('discovery');

  const followByActorId = useMemo(
    () => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])),
    [follows]
  );

  const loadMovies = useCallback(async (nextFilter: string, nextPage: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await client.moviesLatest(nextFilter, nextPage, 24);
      setMovies((current) => (append ? [...current, ...result] : result));
      setHasMore(result.length === 24);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
    setPage(1);
    setSearchResults(null);
    void loadMovies(filter, 1, false);
  }, [filter, loadMovies]);

  useEffect(() => {
    void loadFollows();
  }, []);

  useEffect(() => {
    const element = loaderRef.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !hasMore || loading || loadingMore || searchResults) {
          return;
        }
        const nextPage = page + 1;
        setPage(nextPage);
        void loadMovies(filter, nextPage, true);
      },
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [filter, hasMore, loadMovies, loading, loadingMore, page, searchResults]);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      return;
    }
    setSearchLoading(true);
    setError(null);
    try {
      setSearchResults(await client.search(searchQuery.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
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
      <h1 className="text-2xl font-semibold text-ink">发现</h1>
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            className="min-h-11 w-full rounded-md border border-line px-3 pr-10 text-sm"
            placeholder="搜索番号、演员名..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
          />
          {searchQuery ? (
            <button
              aria-label="清空搜索"
              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md text-slate-400"
              onClick={clearSearch}
              type="button"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <button
          aria-label="搜索作品"
          className="flex min-h-11 items-center gap-1 rounded-md bg-brand px-3 text-white disabled:opacity-60"
          disabled={searchLoading}
          onClick={handleSearch}
          type="button"
        >
          {searchLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {GENRES.map((genre) => (
          <button
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              filter === genre.key ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
            }`}
            key={genre.key}
            onClick={() => setFilter(genre.key)}
            type="button"
          >
            {genre.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4">
        <h2 className="text-sm font-medium text-ink">{searchResults ? `搜索结果 (${searchResults.length})` : '最新作品'}</h2>
        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            加载中...
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(searchResults ?? movies).map((movie) => (
                <MovieCard key={movie.id} movie={movie} onClick={() => openMovie(movie.id)} />
              ))}
            </div>
            {(searchResults ?? movies).length === 0 ? (
              <p className="mt-3 rounded-md border border-line bg-white p-4 text-sm text-slate-500">
                {searchResults ? '没有找到匹配作品' : '暂无最新作品'}
              </p>
            ) : null}
            {!searchResults ? (
              <div className="mt-4 flex justify-center" ref={loaderRef}>
                {loadingMore ? (
                  <Loader2 className="animate-spin text-slate-400" size={20} />
                ) : hasMore ? (
                  <span className="text-xs text-slate-300">上滑加载更多</span>
                ) : (
                  <span className="text-xs text-slate-300">— 已加载全部 —</span>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
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
          onSaveFollow={saveFollow}
        />
      ) : null}
    </section>
  );
}

function MovieCard(props: { readonly movie: Movie; readonly onClick: () => void }) {
  return (
    <button
      className="rounded-lg border border-line bg-white p-2 text-left transition-shadow hover:shadow-md"
      onClick={props.onClick}
      type="button"
    >
      <MoviePoster alt={props.movie.number} src={props.movie.thumb_url} />
      <p className="mt-1 text-xs font-medium text-ink">{props.movie.number}</p>
      <p className="line-clamp-2 text-xs text-slate-500">{props.movie.title}</p>
      <p className="mt-1 text-xs text-slate-400">{props.movie.release_date}</p>
    </button>
  );
}
