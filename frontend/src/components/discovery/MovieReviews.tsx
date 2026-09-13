import { useState } from 'react';
import { client } from '../../api';
import { splitOfflineLinks, type OfflineLinkType } from '../../lib/offlineLinks';
import type { MovieReview } from '../../types';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  readonly error: string | null;
  readonly reviews: MovieReview[];
};

type PendingOfflineLink = {
  readonly url: string;
  readonly type: OfflineLinkType;
};

export function MovieReviews(props: Props) {
  const [pending, setPending] = useState<PendingOfflineLink | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function selectOfflineLink(link: PendingOfflineLink) {
    setPending(link);
    setSubmitError(null);
    setMessage(null);
  }

  async function submitOfflineLink() {
    if (!pending || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await client.quickOfflineDownload(pending.url);
      setPending(null);
      setMessage(`已加入 115 离线下载 · ${result.task_id}`);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="mt-5">
        <h3 className="text-sm font-medium text-ink">热门评论</h3>
        {message ? <p className="mt-2 text-sm text-emerald-700" role="status">{message}</p> : null}
        {props.error ? (
          <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-danger">{props.error}</p>
        ) : null}
        {!props.error && props.reviews.length === 0 ? (
          <p className="mt-2 rounded-md border border-line bg-slate-50 p-3 text-sm text-slate-500">暂无评论</p>
        ) : null}
        <div className="mt-2 space-y-2">
          {props.reviews.map((review) => (
            <article className="rounded-lg border border-line bg-slate-50 p-3" key={review.id}>
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="min-w-0 truncate font-medium text-ink">{review.username}</span>
                <span className="shrink-0">{review.status_title} · {formatReviewDate(review.created_at)}</span>
              </div>
              <ReviewContent content={review.content} onOfflineLink={selectOfflineLink} />
              <p className="mt-2 text-xs text-slate-500">评分 {review.score} · 赞 {review.likes_count}</p>
            </article>
          ))}
        </div>
      </section>
      {pending ? (
        <ConfirmDialog
          title="确认离线下载"
          description={(
            <div className="space-y-2">
              <p>确认将这条{pending.type === 'magnet' ? '磁力' : 'ED2K'}链接加入 115 离线下载？</p>
              <p className="break-all rounded-md bg-slate-100 p-2 font-mono text-xs text-slate-700">{pending.url}</p>
              {submitError ? <p className="rounded-md bg-red-50 p-2 text-xs text-danger" role="alert">{submitError}</p> : null}
            </div>
          )}
          confirmLabel="加入离线下载"
          busy={submitting}
          onCancel={() => {
            if (submitting) return;
            setPending(null);
            setSubmitError(null);
          }}
          onConfirm={() => void submitOfflineLink()}
        />
      ) : null}
    </>
  );
}

function ReviewContent(props: {
  readonly content: string;
  readonly onOfflineLink: (link: PendingOfflineLink) => void;
}) {
  const segments = splitOfflineLinks(props.content);
  return (
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
      {segments.map((segment, index) => segment.url && segment.type ? (
        <button
          className="inline break-all font-mono text-[12px] text-brand underline decoration-brand/30 underline-offset-2"
          key={`${segment.url}-${index}`}
          onClick={() => props.onOfflineLink({ url: segment.url as string, type: segment.type as OfflineLinkType })}
          type="button"
        >
          {segment.text}
        </button>
      ) : <span key={`text-${index}`}>{segment.text}</span>)}
    </p>
  );
}

function formatReviewDate(value: string): string {
  return value ? value.slice(0, 10) : '';
}
