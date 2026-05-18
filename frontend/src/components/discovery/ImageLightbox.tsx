import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef, type TouchEvent } from 'react';
import { imgUrl } from '../../lib/javdb';

const SWIPE_THRESHOLD_PX = 48;

type PreviewImage = {
  readonly large_url: string;
  readonly thumb_url: string;
};

type Props = {
  readonly images: PreviewImage[];
  readonly index: number;
  readonly onClose: () => void;
  readonly onChange: (index: number) => void;
};

type SwipeHandlers = {
  readonly onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  readonly onTouchEnd: (event: TouchEvent<HTMLDivElement>) => void;
};

export function ImageLightbox({ images, index, onClose, onChange }: Props) {
  const image = images[index];
  const canGoPrev = index > 0;
  const canGoNext = index < images.length - 1;
  const swipeHandlers = useSwipeNavigation(showPrevious, showNext);

  function showPrevious() {
    if (canGoPrev) {
      onChange(index - 1);
    }
  }

  function showNext() {
    if (canGoNext) {
      onChange(index + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex h-dvh flex-col bg-black/95">
      <LightboxHeader index={index} total={images.length} onClose={onClose} />
      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        {...swipeHandlers}
      >
        <PreviewNavButton direction="previous" disabled={!canGoPrev} onClick={showPrevious} />
        <img
          alt=""
          className="max-h-full max-w-full select-none rounded object-contain"
          draggable={false}
          src={imgUrl(image.large_url)}
        />
        <PreviewNavButton direction="next" disabled={!canGoNext} onClick={showNext} />
      </div>
    </div>
  );
}

function useSwipeNavigation(onPrevious: () => void, onNext: () => void): SwipeHandlers {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) {
      return;
    }
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }
    if (deltaX < 0) {
      onNext();
      return;
    }
    onPrevious();
  }

  return { onTouchStart, onTouchEnd };
}

function LightboxHeader(props: { readonly index: number; readonly total: number; readonly onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <span className="text-sm">{props.index + 1} / {props.total}</span>
      <button
        aria-label="关闭预览图"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"
        onClick={props.onClose}
        type="button"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function PreviewNavButton(props: {
  readonly direction: 'previous' | 'next';
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const isPrevious = props.direction === 'previous';
  const Icon = isPrevious ? ChevronLeft : ChevronRight;
  const position = isPrevious ? 'left-3' : 'right-3';
  return (
    <button
      aria-label={isPrevious ? '上一张预览图' : '下一张预览图'}
      className={`absolute ${position} top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 disabled:opacity-20`}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon size={20} />
    </button>
  );
}
