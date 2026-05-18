import { UserRound } from 'lucide-react';
import type { MovieDetail } from '../../types';
import type { ActorRef } from '../../lib/javdb';
import { imgUrl } from '../../lib/javdb';

type Props = {
  readonly detail: MovieDetail;
  readonly onOpenActor: (actor: ActorRef) => void;
};

export function MovieSummary({ detail, onOpenActor }: Props) {
  return (
    <>
      <img alt={detail.number} className="mx-auto max-h-96 rounded-lg object-contain" src={imgUrl(detail.cover_url)} />
      <h2 className="mt-4 text-lg font-semibold text-ink">
        {detail.number} {detail.title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>{detail.release_date}</span>
        <span>{detail.duration} 分钟</span>
        <span>⭐ {detail.score}</span>
        {detail.has_cnsub ? (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">中文字幕</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {detail.actors.map((actor) => (
          <button
            className="flex min-h-11 items-center gap-2 rounded-full bg-slate-100 pl-1 pr-3 text-left"
            key={actor.id}
            onClick={() => onOpenActor(actor)}
            type="button"
          >
            {actor.avatar_url ? (
              <img alt={actor.name} className="h-9 w-9 rounded-full object-cover" src={imgUrl(actor.avatar_url)} />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                <UserRound size={16} />
              </span>
            )}
            <span className="text-sm font-medium text-ink">{actor.name}</span>
          </button>
        ))}
      </div>
      {detail.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {detail.tags.map((tag) => (
            <span className="rounded-full border border-line px-2 py-1 text-xs text-slate-500" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
