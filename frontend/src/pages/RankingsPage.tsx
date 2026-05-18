import { ChevronLeft, ChevronRight, Film, Loader2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { actorLabel, imgUrl, type ActorRef } from '../lib/javdb';
import type { Follow, Movie, PreviewImage, RankingActor } from '../types';

const MOVIE_PERIODS = [
  { value: 'daily', label: '日榜' },
  { value: 'weekly', label: '周榜' },
  { value: 'monthly', label: '月榜' }
] as const;

type RankingMode = 'movies' | 'actors';

type SelectedMovie = {
  readonly id: string;
  readonly parentActor: ActorRef | null;
};

type SelectedActor = {
  readonly actor: ActorRef;
  readonly parentMovie: SelectedMovie | null;
};

export function RankingsPage() {
  const [mode, setMode] = useState<RankingMode>('movies');
  const [moviePeriod, setMoviePeriod] = useState('daily');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [actors, setActors] = useState<RankingActor[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SelectedMovie | null>(null);
  const [selectedActor, setSelectedActor] = useState<SelectedActor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const followByActorId = useMemo(() => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])), [follows]);
  const loadRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'movies') {
        setMovies([]);
        window.scrollTo({ top: 0 });
        setMovies(await client.rankingsPlayback(moviePeriod));
      } else {
        setActors([]);
        window.scrollTo({ top: 0 });
        setActors(await client.rankingsActors());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, moviePeriod]);
  useEffect(() => void loadRankings(), [loadRankings]);
  useEffect(() => void loadFollows(setFollows), []);
  return (
    <section>
      <RankingsHeader mode={mode} onModeChange={setMode} />
      <RankingsFilters mode={mode} moviePeriod={moviePeriod} onMoviePeriodChange={setMoviePeriod} />
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {loading ? <LoadingState /> : null}
      {!loading && mode === 'movies' ? <MovieRankingList movies={movies} onOpen={(id) => openMovie(id, setSelectedActor, setSelectedMovie)} /> : null}
      {!loading && mode === 'actors' ? <ActorRankingList actors={actors} onOpen={(actor) => openActor(actor, setSelectedMovie, setSelectedActor)} /> : null}
      {selectedMovie ? <MovieDetailSheet movieId={selectedMovie.id} onClose={() => closeMovie(selectedMovie, setSelectedMovie, setSelectedActor)} onOpenActor={(actor, parentMovieId) => openActor(actor, setSelectedMovie, setSelectedActor, selectedMovie, parentMovieId)} /> : null}
      {selectedActor ? <ActorDetailSheet actor={selectedActor.actor} follow={followByActorId[selectedActor.actor.id] ?? null} onClose={() => closeActor(selectedActor, setSelectedMovie, setSelectedActor)} onOpenMovie={(id, actor) => openMovie(id, setSelectedActor, setSelectedMovie, actor)} onSaveFollow={(actor, tagIds, tagNames) => saveFollow(actor, tagIds, tagNames, setFollows)} /> : null}
    </section>
  );
}

function RankingsHeader(props: { readonly mode: RankingMode; readonly onModeChange: (mode: RankingMode) => void }) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">排行</h1>
      <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        <ModeButton active={props.mode === 'movies'} icon={<Film size={16} />} label="作品榜" onClick={() => props.onModeChange('movies')} />
        <ModeButton active={props.mode === 'actors'} icon={<Users size={16} />} label="演员榜" onClick={() => props.onModeChange('actors')} />
      </div>
    </>
  );
}

function ModeButton(props: { readonly active: boolean; readonly icon: ReactNode; readonly label: string; readonly onClick: () => void }) {
  return (
    <button className={`flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium ${props.active ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`} onClick={props.onClick} type="button">
      {props.icon}
      {props.label}
    </button>
  );
}

function RankingsFilters(props: {
  readonly mode: RankingMode;
  readonly moviePeriod: string;
  readonly onMoviePeriodChange: (value: string) => void;
}) {
  if (props.mode === 'actors') {
    return <p className="mt-3 text-xs text-slate-500">演员月榜</p>;
  }
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {MOVIE_PERIODS.map((option) => (
        <button className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.moviePeriod === option.value ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-line'}`} key={option.value} onClick={() => props.onMoviePeriodChange(option.value)} type="button">
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="animate-spin" size={16} />
      加载中...
    </p>
  );
}

function MovieRankingList(props: { readonly movies: Movie[]; readonly onOpen: (id: string) => void }) {
  if (props.movies.length === 0) {
    return <p className="mt-4 rounded-md border border-line bg-white p-3 text-sm text-slate-500">暂无作品排行</p>;
  }
  return <div className="mt-4 space-y-3">{props.movies.map((movie, index) => <MovieRankingCard index={index} key={movie.id} movie={movie} onOpen={() => props.onOpen(movie.id)} />)}</div>;
}

function MovieRankingCard(props: { readonly index: number; readonly movie: Movie; readonly onOpen: () => void }) {
  return (
    <article className="rounded-lg border border-line bg-white p-3">
      <div className="flex gap-3">
        <button className="relative shrink-0 text-left" onClick={props.onOpen} type="button">
          <RankBadge index={props.index} />
          <MoviePoster alt={props.movie.number} className="h-32 w-24 rounded" src={props.movie.thumb_url} />
        </button>
        <PreviewCarousel images={props.movie.preview_images} />
      </div>
      <button className="mt-3 block w-full text-left" onClick={props.onOpen} type="button">
        <span className="line-clamp-2 text-sm font-semibold text-ink">{props.movie.title}</span>
        <span className="mt-1 block text-xs text-slate-500">{props.movie.number} · {props.movie.release_date}</span>
      </button>
    </article>
  );
}

function RankBadge(props: { readonly index: number }) {
  return <span className="absolute left-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/90 text-xs font-semibold text-white">{props.index + 1}</span>;
}

function PreviewCarousel(props: { readonly images: PreviewImage[] | undefined }) {
  const images = (props.images ?? []).slice(0, 3);
  const [index, setIndex] = useState(0);
  const swipe = usePreviewSwipe(() => setIndex((value) => Math.max(0, value - 1)), () => setIndex((value) => Math.min(images.length - 1, value + 1)));
  if (images.length === 0) {
    return <span className="flex aspect-video min-w-0 flex-1 rounded bg-slate-100" />;
  }
  return (
    <div className="min-w-0 flex-1">
      <div className="relative h-36 overflow-hidden rounded bg-slate-100" {...swipe}>
        <img alt="" className="h-full w-full object-contain" loading="lazy" src={imgUrl(images[index].large_url || images[index].thumb_url)} />
        <PreviewButton direction="previous" disabled={index === 0} onClick={() => setIndex(index - 1)} />
        <PreviewButton direction="next" disabled={index >= images.length - 1} onClick={() => setIndex(index + 1)} />
      </div>
    </div>
  );
}

function PreviewButton(props: { readonly direction: 'previous' | 'next'; readonly disabled: boolean; readonly onClick: () => void }) {
  const isPrevious = props.direction === 'previous';
  const Icon = isPrevious ? ChevronLeft : ChevronRight;
  const position = isPrevious ? 'left-2' : 'right-2';
  return <button aria-label={isPrevious ? '上一张预览图' : '下一张预览图'} className={`absolute ${position} top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-20`} disabled={props.disabled} onClick={props.onClick} type="button"><Icon size={18} /></button>;
}

function usePreviewSwipe(onPrevious: () => void, onNext: () => void) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  return {
    onTouchStart: (event: TouchEvent<HTMLDivElement>) => {
      startX.current = event.changedTouches[0].clientX;
      startY.current = event.changedTouches[0].clientY;
    },
    onTouchEnd: (event: TouchEvent<HTMLDivElement>) => {
      if (startX.current === null || startY.current === null) return;
      const deltaX = event.changedTouches[0].clientX - startX.current;
      const deltaY = event.changedTouches[0].clientY - startY.current;
      startX.current = null;
      startY.current = null;
      if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      if (deltaX < 0) {
        onNext();
        return;
      }
      onPrevious();
    }
  };
}

function ActorRankingList(props: { readonly actors: RankingActor[]; readonly onOpen: (actor: ActorRef) => void }) {
  if (props.actors.length === 0) {
    return <p className="mt-4 rounded-md border border-line bg-white p-3 text-sm text-slate-500">暂无演员排行</p>;
  }
  return <div className="mt-4 space-y-3">{props.actors.map((actor, index) => <ActorRankingCard actor={actor} index={index} key={actor.id} onOpen={() => props.onOpen(rankingActorRef(actor))} />)}</div>;
}

function ActorRankingCard(props: { readonly actor: RankingActor; readonly index: number; readonly onOpen: () => void }) {
  const name = rankingActorName(props.actor);
  return (
    <button className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-line bg-white p-3 text-left" onClick={props.onOpen} type="button">
      <RankBadge index={props.index} />
      {props.actor.avatar_url ? <img alt={name} className="h-12 w-12 rounded-lg object-cover" src={imgUrl(props.actor.avatar_url)} /> : <span className="h-12 w-12 rounded-lg bg-slate-100" />}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{name}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{props.actor.name}</span>
      </span>
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

function openMovie(id: string, setSelectedActor: (actor: SelectedActor | null) => void, setSelectedMovie: (movie: SelectedMovie | null) => void, parentActor: ActorRef | null = null) {
  setSelectedActor(null);
  setSelectedMovie({ id, parentActor });
}

function closeMovie(selectedMovie: SelectedMovie, setSelectedMovie: (movie: SelectedMovie | null) => void, setSelectedActor: (actor: SelectedActor | null) => void) {
  setSelectedMovie(null);
  if (selectedMovie.parentActor) {
    setSelectedActor({ actor: selectedMovie.parentActor, parentMovie: null });
  }
}

function openActor(actor: ActorRef, setSelectedMovie: (movie: SelectedMovie | null) => void, setSelectedActor: (actor: SelectedActor | null) => void, selectedMovie: SelectedMovie | null = null, parentMovieId?: string) {
  setSelectedMovie(null);
  setSelectedActor({
    actor,
    parentMovie: parentMovieId ? { id: parentMovieId, parentActor: selectedMovie?.parentActor ?? null } : null
  });
}

function closeActor(selectedActor: SelectedActor, setSelectedMovie: (movie: SelectedMovie | null) => void, setSelectedActor: (actor: SelectedActor | null) => void) {
  setSelectedActor(null);
  if (selectedActor.parentMovie) {
    setSelectedMovie(selectedActor.parentMovie);
  }
}
