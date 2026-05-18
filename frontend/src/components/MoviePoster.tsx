import { imgUrl } from '../lib/javdb';

type Props = {
  readonly alt: string;
  readonly className?: string;
  readonly src: string | null | undefined;
};

export function MoviePoster({ alt, className = 'aspect-[3/4] w-full rounded', src }: Props) {
  const classes = `flex overflow-hidden bg-slate-100 ${className}`;
  if (!src) {
    return <span aria-label={alt} className={classes} />;
  }
  return (
    <span className={classes}>
      <img alt={alt} className="h-full w-full object-cover object-right" src={imgUrl(src)} />
    </span>
  );
}
