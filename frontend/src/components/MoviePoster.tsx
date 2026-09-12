import { useEffect, useState } from 'react';
import { imgUrl } from '../lib/javdb';

type Props = {
  readonly alt: string;
  readonly className?: string;
  readonly eager?: boolean;
  readonly src: string | null | undefined;
};

export function MoviePoster({ alt, className = 'aspect-[3/4] w-full rounded', eager = false, src }: Props) {
  const [failed, setFailed] = useState(false);
  const classes = `flex items-center justify-center overflow-hidden bg-slate-100 ${className}`;

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <span aria-label={alt} className={`${classes} px-2 text-center text-[11px] text-slate-400`}>暂无封面</span>;
  }
  return (
    <span className={classes}>
      <img
        alt={alt}
        className="h-full w-full object-cover object-right"
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        src={imgUrl(src)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
