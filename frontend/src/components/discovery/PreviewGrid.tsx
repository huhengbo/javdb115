import type { PreviewImage } from '../../types';
import { imgUrl } from '../../lib/javdb';

type Props = {
  readonly images: PreviewImage[];
  readonly onPreview: (index: number) => void;
};

export function PreviewGrid({ images, onPreview }: Props) {
  if (images.length === 0) {
    return null;
  }
  return (
    <section className="mt-5">
      <h3 className="text-sm font-medium text-ink">预览图</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <button key={image.large_url} onClick={() => onPreview(index)} type="button">
            <img alt="" className="aspect-[3/4] w-full rounded object-cover" src={imgUrl(image.thumb_url)} />
          </button>
        ))}
      </div>
    </section>
  );
}
