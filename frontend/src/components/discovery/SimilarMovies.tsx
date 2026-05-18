import type { Movie } from '../../types';
import { imgUrl } from '../../lib/javdb';

type Props = {
  readonly movies: Movie[];
  readonly onOpen: (id: string) => void;
};

export function SimilarMovies(props: Props) {
  if (props.movies.length === 0) {
    return null;
  }
  return (
    <section className="mt-5">
      <h3 className="text-sm font-medium text-ink">相似作品</h3>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
        {props.movies.slice(0, 12).map((movie) => (
          <button className="w-32 shrink-0 text-left" key={movie.id} onClick={() => props.onOpen(movie.id)} type="button">
            <img alt={movie.number} className="aspect-[3/4] w-full rounded object-cover" src={imgUrl(movie.thumb_url)} />
            <p className="mt-1 truncate text-xs font-medium text-ink">{movie.number}</p>
            <p className="line-clamp-2 text-xs text-slate-500">{movie.title}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
