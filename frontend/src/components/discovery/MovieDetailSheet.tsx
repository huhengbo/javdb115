import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { client } from '../../api';
import type { MagnetItem, MovieDetail, MovieReview, Task, TaskHistoryItem } from '../../types';
import type { ActorRef } from '../../lib/javdb';
import { formatMagnetSize } from '../../lib/javdb';
import { ConfirmDialog } from './ConfirmDialog';
import { ImageLightbox } from './ImageLightbox';
import { MagnetList } from './MagnetList';
import { MovieReviews } from './MovieReviews';
import { MovieSummary } from './MovieSummary';
import { MovieTaskHistory, taskSummary } from './MovieTaskHistory';
import { PreviewGrid } from './PreviewGrid';
import { SimilarMovies } from './SimilarMovies';

type Props = {
  readonly isTop?: boolean;
  readonly movieId: string;
  readonly onClose: () => void;
  readonly onOpenActor: (actor: ActorRef, parentMovieId: string) => void;
  readonly onOpenMovie: (movieId: string) => void;
};

export function MovieDetailSheet({ isTop = true, movieId, onClose, onOpenActor, onOpenMovie }: Props) {
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [magnets, setMagnets] = useState<MagnetItem[]>([]);
  const [reviews, setReviews] = useState<MovieReview[]>([]);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [taskHistoryError, setTaskHistoryError] = useState<string | null>(null);
  const [taskHistoryLoading, setTaskHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [confirmMagnet, setConfirmMagnet] = useState<MagnetItem | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);
  const [submittingHash, setSubmittingHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    setPreviewIndex(null);
    setReviews([]);
    setTaskHistory([]);
    setReviewsError(null);
    setTaskHistoryError(null);
    loadMovieDetail(movieId)
      .then(({ movieDetail, movieMagnets, movieReviews, movieReviewsError }) => {
        if (cancelled) {
          return;
        }
        setDetail(movieDetail);
        setMagnets(movieMagnets);
        setReviews(movieReviews);
        setReviewsError(movieReviewsError);
        void refreshTaskHistory(movieDetail.number);
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [movieId]);

  async function submitMagnet(force = false) {
    const magnet = force ? duplicateWarning?.magnet : confirmMagnet;
    if (!magnet) {
      return;
    }
    setSubmittingHash(magnet.hash);
    try {
      const result = await client.submitMovieOffline(movieId, magnet.hash, force);
      if (result.duplicate_task && !force) {
        setConfirmMagnet(null);
        setDuplicateWarning({ magnet, task: result.duplicate_task });
        return;
      }
      setConfirmMagnet(null);
      setDuplicateWarning(null);
      setMessage(`已提交离线下载，任务 #${result.task_id}`);
      if (detail?.number) {
        await refreshTaskHistory(detail.number);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmittingHash(null);
    }
  }

  async function refreshTaskHistory(code: string) {
    setTaskHistoryLoading(true);
    try {
      setTaskHistory(await client.taskHistory(code));
      setTaskHistoryError(null);
    } catch (err) {
      setTaskHistoryError((err as Error).message);
    } finally {
      setTaskHistoryLoading(false);
    }
  }

  return (
    <>
      <div className={`fixed inset-0 ${isTop ? 'pointer-events-auto z-[70]' : 'pointer-events-none z-[60]'} overflow-y-auto bg-white`}>
        <div className="mx-auto min-h-full max-w-3xl bg-white">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
            <button className="flex items-center gap-1 text-sm text-slate-600" onClick={onClose} type="button">
              <ArrowLeft size={18} />
              返回
            </button>
            <span className="text-sm font-medium text-ink">作品详情 · {detail?.number ?? movieId}</span>
            <span className="w-12" />
          </header>
          {loading ? <LoadingState /> : null}
          {!loading && error ? <ErrorState error={error} onClose={onClose} /> : null}
          {!loading && detail ? (
            <Content
              detail={detail}
              magnets={magnets}
              message={message}
              onOpenActor={(actor) => onOpenActor(actor, movieId)}
              onOpenMovie={onOpenMovie}
              onPreview={setPreviewIndex}
              onSelectMagnet={setConfirmMagnet}
              reviews={reviews}
              reviewsError={reviewsError}
              taskHistory={taskHistory}
              taskHistoryError={taskHistoryError}
              taskHistoryLoading={taskHistoryLoading}
            />
          ) : null}
        </div>
      </div>
      {previewIndex !== null && detail ? (
        <ImageLightbox
          images={detail.preview_images}
          index={previewIndex}
          onChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
      {confirmMagnet ? (
        <ConfirmDialog
          title="确认离线下载"
          description={
            <div className="space-y-2">
              <p className="break-all font-mono text-xs text-slate-700">{confirmMagnet.name}</p>
              <p>大小：{formatMagnetSize(confirmMagnet.size)}</p>
            </div>
          }
          confirmLabel="提交到 115"
          busy={submittingHash === confirmMagnet.hash}
          onCancel={() => setConfirmMagnet(null)}
          onConfirm={() => submitMagnet(false)}
        />
      ) : null}
      {duplicateWarning ? (
        <ConfirmDialog
          title="确认重复提交"
          description={
            <div className="space-y-2 text-sm">
              <p>这个作品已经有任务记录，确认后会重新提交一条新的离线任务。</p>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-100 p-2 text-xs text-slate-700">
                {taskSummary(duplicateWarning.task)}
              </pre>
            </div>
          }
          confirmLabel="仍然提交"
          busy={submittingHash === duplicateWarning.magnet.hash}
          onCancel={() => setDuplicateWarning(null)}
          onConfirm={() => submitMagnet(true)}
        />
      ) : null}
    </>
  );
}

type DuplicateWarning = {
  readonly magnet: MagnetItem;
  readonly task: Task;
};

function LoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="animate-spin" size={20} />
      加载中...
    </div>
  );
}

function ErrorState({ error, onClose }: { readonly error: string; readonly onClose: () => void }) {
  return (
    <div className="p-4">
      <p className="rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p>
      <button className="mt-3 min-h-11 rounded-md border border-line px-3 text-sm" onClick={onClose} type="button">
        关闭
      </button>
    </div>
  );
}

async function loadMovieDetail(movieId: string) {
  const bundle = await client.movieBundle(movieId);
  return {
    movieDetail: bundle.detail,
    movieMagnets: bundle.magnets,
    movieReviews: bundle.reviews,
    movieReviewsError: bundle.reviews_error
  };
}

type ContentProps = {
  readonly detail: MovieDetail;
  readonly magnets: MagnetItem[];
  readonly message: string | null;
  readonly onOpenActor: (actor: ActorRef) => void;
  readonly onOpenMovie: (id: string) => void;
  readonly onPreview: (index: number) => void;
  readonly onSelectMagnet: (magnet: MagnetItem) => void;
  readonly reviews: MovieReview[];
  readonly reviewsError: string | null;
  readonly taskHistory: TaskHistoryItem[];
  readonly taskHistoryError: string | null;
  readonly taskHistoryLoading: boolean;
};

function Content(props: ContentProps) {
  return (
    <div className="p-4">
      {props.message ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{props.message}</p>
      ) : null}
      <MovieSummary detail={props.detail} onOpenActor={props.onOpenActor} />
      <MagnetList magnets={props.magnets} onSelect={props.onSelectMagnet} />
      <MovieTaskHistory
        error={props.taskHistoryError}
        items={props.taskHistory}
        loading={props.taskHistoryLoading}
      />
      <PreviewGrid images={props.detail.preview_images} onPreview={props.onPreview} />
      <SimilarMovies movies={props.detail.relative_movies} onOpen={props.onOpenMovie} />
      <MovieReviews error={props.reviewsError} reviews={props.reviews} />
    </div>
  );
}
