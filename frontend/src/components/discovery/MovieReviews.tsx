import type { MovieReview } from '../../types';

type Props = {
  readonly error: string | null;
  readonly reviews: MovieReview[];
};

export function MovieReviews(props: Props) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-medium text-ink">热门评论</h3>
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
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{review.content}</p>
            <p className="mt-2 text-xs text-slate-500">评分 {review.score} · 赞 {review.likes_count}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatReviewDate(value: string): string {
  return value ? value.slice(0, 10) : '';
}
