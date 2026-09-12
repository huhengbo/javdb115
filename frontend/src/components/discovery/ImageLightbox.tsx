import { ChevronLeft, ChevronRight, Loader2, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const swipeHandlers = useSwipeNavigation(showPrevious, showNext);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setRetryKey(0);
    const adjacent = [images[index - 1], images[index + 1]].filter(Boolean);
    adjacent.forEach((item) => {
      const preload = document.createElement('img');
      preload.src = imgUrl(item.large_url || item.thumb_url);
    });
  }, [images, index]);

  function showPrevious() {
    if (canGoPrev) onChange(index - 1);
  }

  function showNext() {
    if (canGoNext) onChange(index + 1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNext();
    }
  }

  return (
    <dialog
      aria-label={`预览图 ${index + 1}/${images.length}`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/95"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-dvh flex-col">
        <LightboxHeader index={index} total={images.length} onClose={onClose} />
        <div className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))]" {...swipeHandlers}>
          <PreviewNavButton direction="previous" disabled={!canGoPrev} onClick={showPrevious} />
          {loading && !failed ? <span className="absolute flex items-center gap-2 text-sm text-white/75" aria-live="polite"><Loader2 className="animate-spin" size={20} />大图加载中...</span> : null}
          {failed ? (
            <div className="flex max-w-xs flex-col items-center gap-3 rounded-lg bg-white/10 p-5 text-center text-sm">
              <span>预览图加载失败</span>
              <button className="flex min-h-11 items-center gap-2 rounded-md bg-white/10 px-4" onClick={() => { setFailed(false); setLoading(true); setRetryKey((value) => value + 1); }} type="button"><RotateCcw size={16} />重试</button>
            </div>
          ) : (
            <img
              alt={`作品预览图 ${index + 1}`}
              className={`max-h-full max-w-full select-none rounded object-contain ${loading ? 'opacity-0' : 'opacity-100'}`}
              decoding="async"
              draggable={false}
              key={`${index}-${retryKey}`}
              src={imgUrl(image.large_url || image.thumb_url)}
              onError={() => { setLoading(false); setFailed(true); }}
              onLoad={() => setLoading(false)}
            />
          )}
          <PreviewNavButton direction="next" disabled={!canGoNext} onClick={showNext} />
        </div>
      </div>
    </dialog>
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
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0) onNext();
    else onPrevious();
  }

  return { onTouchStart, onTouchEnd };
}

function LightboxHeader(props: { readonly index: number; readonly total: number; readonly onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <span className="text-sm">{props.index + 1} / {props.total}</span>
      <button autoFocus aria-label="关闭预览图" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20" onClick={props.onClose} type="button"><X size={18} /></button>
    </div>
  );
}

function PreviewNavButton(props: { readonly direction: 'previous' | 'next'; readonly disabled: boolean; readonly onClick: () => void }) {
  const isPrevious = props.direction === 'previous';
  const Icon = isPrevious ? ChevronLeft : ChevronRight;
  const position = isPrevious ? 'left-3' : 'right-3';
  return (
    <button aria-label={isPrevious ? '上一张预览图' : '下一张预览图'} className={`absolute ${position} top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 active:bg-black/65 disabled:opacity-20`} disabled={props.disabled} onClick={props.onClick} type="button"><Icon size={20} /></button>
  );
}
