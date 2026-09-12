import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../../api';
import { MoviePoster } from '../MoviePoster';
import type { ActorDetail, Follow, Movie } from '../../types';
import {
  ACTOR_SORT_OPTIONS,
  actorLabel,
  FOLLOW_TAG_OPTIONS,
  imgUrl,
  type ActorRef
} from '../../lib/javdb';
import { FollowRuleDialog } from './FollowRuleDialog';

const PAGE_SIZE = 24;

type Props = {
  readonly actor: ActorRef;
  readonly follow: Follow | null;
  readonly isTop?: boolean;
  readonly onClose: () => void;
  readonly onOpenMovie: (movieId: string, parentActor: ActorRef) => void;
  readonly onSaveFollow: (actor: ActorRef, tagIds: string[], tagNames: string[]) => Promise<void>;
};

export function ActorDetailSheet(props: Props) {
  const [detail, setDetail] = useState<ActorDetail | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sortType, setSortType] = useState(0);
  const [activeTagIds, setActiveTagIds] = useState<string[]>(props.follow?.selected_tag_ids ?? []);
  const [showFollowDialog, setShowFollowDialog] = useState(false);
  const movieSeq = useRef(0);
  const detailSeq = useRef(0);
  const followTagKey = props.follow?.selected_tag_ids.join('|') ?? '';

  const currentActor = useMemo(
    () => ({
      ...props.actor,
      name: actorLabel(detail?.name_zht || detail?.name || props.actor.name)
    }),
    [detail, props.actor]
  );

  const loadMovies = useCallback(
    async (nextPage: number, append: boolean) => {
      const seq = ++movieSeq.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await client.actorMovies(props.actor.id, activeTagIds, sortType, nextPage, PAGE_SIZE);
        if (seq !== movieSeq.current) return;
        setMovies((current) => append ? mergeMovies(current, result) : result);
        setHasMore(result.length === PAGE_SIZE);
        setPage(nextPage);
        setFailedPage(null);
      } catch (err) {
        if (seq === movieSeq.current) {
          setError((err as Error).message);
          if (append) setFailedPage(nextPage);
        }
      } finally {
        if (seq === movieSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeTagIds, props.actor.id, sortType]
  );

  useEffect(() => {
    const seq = ++detailSeq.current;
    setDetail(null);
    client.actorDetail(props.actor.id)
      .then((result) => {
        if (seq === detailSeq.current) setDetail(result);
      })
      .catch((err: Error) => {
        if (seq === detailSeq.current) setError(err.message);
      });
  }, [props.actor.id]);

  useEffect(() => {
    setActiveTagIds(props.follow?.selected_tag_ids ?? []);
  }, [props.actor.id, followTagKey, props.follow?.selected_tag_ids]);

  useEffect(() => {
    setFailedPage(null);
    void loadMovies(1, false);
  }, [loadMovies]);

  return (
    <>
      <div
        aria-hidden={props.isTop === false}
        className={`fixed inset-0 ${props.isTop === false ? 'pointer-events-none z-[60]' : 'pointer-events-auto z-[70]'} overflow-y-auto overscroll-contain bg-white`}
        inert={props.isTop === false}
      >
        <div className="mx-auto min-h-full max-w-3xl bg-white">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
            <button className="flex min-h-11 items-center gap-1 text-sm text-slate-600" onClick={props.onClose} type="button">
              <ArrowLeft size={18} />
              返回
            </button>
            <span className="truncate px-2 text-sm font-medium text-ink">演员详情 · {currentActor.name}</span>
            <span className="w-12" />
          </header>
          <div className="p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
            <ActorHeader actor={currentActor} detail={detail} follow={props.follow} onFollow={() => setShowFollowDialog(true)} />
            <ControlTitle title="筛选标签" caption="标签会直接参与演员作品搜索" />
            <FilterBar activeTagIds={activeTagIds} onChange={setActiveTagIds} />
            <ControlTitle title="排序" caption="按 App 接口返回顺序刷新作品列表" />
            <SortBar sortType={sortType} onChange={setSortType} />
            {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
            {loading ? <LoadingBlock /> : null}
            {!loading ? <MovieGrid movies={movies} actor={currentActor} onOpenMovie={props.onOpenMovie} /> : null}
            {!loading && (hasMore || failedPage) ? (
              <button
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-3 text-sm text-slate-600 disabled:opacity-60"
                disabled={loadingMore}
                onClick={() => void loadMovies(failedPage ?? page + 1, true)}
                type="button"
              >
                {loadingMore ? <Loader2 className="animate-spin" size={16} /> : null}
                {loadingMore ? '加载中...' : failedPage ? `重试加载第 ${failedPage} 页` : '加载更多'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {showFollowDialog ? (
        <FollowRuleDialog
          actor={currentActor}
          initialTagIds={props.follow?.selected_tag_ids ?? []}
          onClose={() => setShowFollowDialog(false)}
          onSave={(tagIds, tagNames) => props.onSaveFollow(currentActor, tagIds, tagNames)}
        />
      ) : null}
    </>
  );
}

function ControlTitle({ caption, title }: { readonly caption: string; readonly title: string }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </div>
  );
}

function ActorHeader(props: {
  readonly actor: ActorRef;
  readonly detail: ActorDetail | null;
  readonly follow: Follow | null;
  readonly onFollow: () => void;
}) {
  return (
    <section className="rounded-lg bg-white">
      <div className="flex items-start gap-3">
        {props.actor.avatar_url ? (
          <img alt={props.actor.name} className="h-20 w-20 shrink-0 rounded-lg object-cover" decoding="async" src={imgUrl(props.actor.avatar_url)} />
        ) : (
          <span className="h-20 w-20 shrink-0 rounded-lg bg-slate-200" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">{props.actor.name}</h2>
          <p className="mt-1 text-sm text-slate-500">出演 {props.detail?.videos_count ?? 0} 部影片</p>
          <p className="mt-1 text-xs text-slate-500">{detailLine(props.detail)}</p>
        </div>
        <button className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-brand px-3 text-sm text-white active:opacity-85" onClick={props.onFollow} type="button">
          <Plus size={16} />
          {props.follow ? '修改标签' : '关注'}
        </button>
      </div>
      {props.follow ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {props.follow.selected_tag_names.map((tagName) => (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600" key={tagName}>{tagName}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FilterBar(props: { readonly activeTagIds: string[]; readonly onChange: (tagIds: string[]) => void }) {
  function toggle(tagId: string) {
    props.onChange(
      props.activeTagIds.includes(tagId)
        ? props.activeTagIds.filter((item) => item !== tagId)
        : [...props.activeTagIds, tagId]
    );
  }

  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      <button aria-pressed={props.activeTagIds.length === 0} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.activeTagIds.length === 0 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => props.onChange([])} type="button">全部</button>
      {FOLLOW_TAG_OPTIONS.map((tag) => (
        <button aria-pressed={props.activeTagIds.includes(tag.id)} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.activeTagIds.includes(tag.id) ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`} key={tag.id} onClick={() => toggle(tag.id)} type="button">{tag.name}</button>
      ))}
    </div>
  );
}

function SortBar(props: { readonly sortType: number; readonly onChange: (value: number) => void }) {
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {ACTOR_SORT_OPTIONS.map((option) => (
        <button aria-pressed={props.sortType === option.value} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-medium ${props.sortType === option.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`} key={option.value} onClick={() => props.onChange(option.value)} type="button">{option.label}</button>
      ))}
    </div>
  );
}

function MovieGrid(props: { readonly movies: Movie[]; readonly actor: ActorRef; readonly onOpenMovie: (movieId: string, parentActor: ActorRef) => void }) {
  if (props.movies.length === 0) return <p className="mt-4 rounded-md border border-line p-3 text-sm text-slate-500">暂无作品</p>;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {props.movies.map((movie) => (
        <button className="text-left active:opacity-80" key={movie.id} onClick={() => props.onOpenMovie(movie.id, props.actor)} type="button">
          <MoviePoster alt={movie.number} src={movie.thumb_url} />
          <p className="mt-1 line-clamp-1 text-xs font-medium text-ink">{movie.number}</p>
          <p className="line-clamp-2 text-xs text-slate-500">{movie.title}</p>
          <p className="mt-1 text-xs text-slate-400">{movie.release_date}</p>
        </button>
      ))}
    </div>
  );
}

function LoadingBlock() {
  return <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500" aria-live="polite"><Loader2 className="animate-spin" size={18} />加载中...</div>;
}

function detailLine(detail: ActorDetail | null): string {
  if (!detail) return '演员资料加载中';
  const segments = [detail.birthday, detail.cup, detail.height ? `${detail.height}cm` : ''].filter(Boolean);
  return segments.join(' · ') || '暂无更多资料';
}

function mergeMovies(current: Movie[], incoming: Movie[]): Movie[] {
  const seen = new Set(current.map((movie) => movie.id));
  return [...current, ...incoming.filter((movie) => !seen.has(movie.id))];
}
