import { ChevronLeft, ChevronRight, Loader2, RotateCcw, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { imgUrl } from '../../lib/javdb';

const MIN_SWIPE_PX = 48;
const SWIPE_VIEWPORT_RATIO = 0.16;
const FAST_SWIPE_MIN_PX = 20;
const FAST_SWIPE_VELOCITY_PX_MS = 0.45;
const EDGE_RESISTANCE = 0.28;
const SETTLE_DURATION_MS = 220;
const RETURN_DURATION_MS = 180;
const INTENT_THRESHOLD_PX = 6;

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

type GestureState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  horizontal: boolean | null;
};

export function ImageLightbox({ images, index, onClose, onChange }: Props) {
  const image = images[index];
  const canGoPrev = index > 0;
  const canGoNext = index < images.length - 1;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    setAnimating(false);
    setDragOffset(0);
    gestureRef.current = null;
    clearSettleTimer();
    const adjacent = [images[index - 1], images[index + 1]].filter(Boolean);
    adjacent.forEach((item) => {
      const preload = document.createElement('img');
      preload.decoding = 'async';
      preload.src = imgUrl(item.large_url || item.thumb_url);
    });
  }, [images, index]);

  useEffect(() => () => clearSettleTimer(), []);

  function clearSettleTimer() {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function viewportWidth() {
    return viewportRef.current?.clientWidth || window.innerWidth || 1;
  }

  function navigate(delta: -1 | 1) {
    if (animating || (delta < 0 && !canGoPrev) || (delta > 0 && !canGoNext)) return;
    const duration = prefersReducedMotion() ? 0 : SETTLE_DURATION_MS;
    clearSettleTimer();
    setAnimating(true);
    setDragOffset(delta > 0 ? -viewportWidth() : viewportWidth());
    settleTimerRef.current = window.setTimeout(() => {
      setAnimating(false);
      setDragOffset(0);
      settleTimerRef.current = null;
      onChange(index + delta);
    }, duration);
  }

  function returnToCenter() {
    const duration = prefersReducedMotion() ? 0 : RETURN_DURATION_MS;
    clearSettleTimer();
    setAnimating(true);
    setDragOffset(0);
    settleTimerRef.current = window.setTimeout(() => {
      setAnimating(false);
      settleTimerRef.current = null;
    }, duration);
  }

  function resistedOffset(rawOffset: number) {
    if ((index === 0 && rawOffset > 0) || (index === images.length - 1 && rawOffset < 0)) {
      return rawOffset * EDGE_RESISTANCE;
    }
    return rawOffset;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (animating || event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    clearSettleTimer();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
      horizontal: null
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || animating) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.horizontal === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < INTENT_THRESHOLD_PX) return;
      gesture.horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }
    if (!gesture.horizontal) return;
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    setDragOffset(resistedOffset(deltaX));
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cancelled || !gesture.horizontal) {
      returnToCenter();
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const width = viewportWidth();
    const distanceThreshold = Math.max(MIN_SWIPE_PX, width * SWIPE_VIEWPORT_RATIO);
    const fastSwipe = Math.abs(gesture.velocityX) >= FAST_SWIPE_VELOCITY_PX_MS && Math.abs(deltaX) >= FAST_SWIPE_MIN_PX;
    const shouldChange = Math.abs(deltaX) >= distanceThreshold || fastSwipe;
    if (!shouldChange) {
      returnToCenter();
      return;
    }
    if (deltaX < 0 && canGoNext) navigate(1);
    else if (deltaX > 0 && canGoPrev) navigate(-1);
    else returnToCenter();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(1);
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
        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          ref={viewportRef}
          onPointerCancel={(event) => finishPointer(event, true)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishPointer(event)}
        >
          <PreviewSlide
            image={images[index - 1]}
            position="previous"
            offset={dragOffset}
            animating={animating}
          />
          <CurrentSlide
            key={`${index}-${image.large_url || image.thumb_url}`}
            image={image}
            index={index}
            offset={dragOffset}
            animating={animating}
          />
          <PreviewSlide
            image={images[index + 1]}
            position="next"
            offset={dragOffset}
            animating={animating}
          />
          <PreviewNavButton direction="previous" disabled={!canGoPrev || animating} onClick={() => navigate(-1)} />
          <PreviewNavButton direction="next" disabled={!canGoNext || animating} onClick={() => navigate(1)} />
        </div>
      </div>
    </dialog>
  );
}

function CurrentSlide(props: {
  readonly image: PreviewImage;
  readonly index: number;
  readonly offset: number;
  readonly animating: boolean;
}) {
  const source = imgUrl(props.image.large_url || props.image.thumb_url);
  const imageRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const node = imageRef.current;
    if (!node?.complete) return;
    if (node.naturalWidth > 0) {
      setFailed(false);
      setLoading(false);
      return;
    }
    setFailed(true);
    setLoading(false);
  }, [retryKey, source]);

  function retry() {
    setFailed(false);
    setLoading(true);
    setRetryKey((value) => value + 1);
  }

  return (
    <div className={slideClass(props.animating)} style={{ transform: `translate3d(${props.offset}px, 0, 0)` }}>
      {loading && !failed ? <span className="absolute flex items-center gap-2 text-sm text-white/75" aria-live="polite"><Loader2 className="animate-spin" size={20} />大图加载中...</span> : null}
      {failed ? (
        <div className="flex max-w-xs flex-col items-center gap-3 rounded-lg bg-white/10 p-5 text-center text-sm">
          <span>预览图加载失败</span>
          <button className="flex min-h-11 items-center gap-2 rounded-md bg-white/10 px-4" onClick={retry} type="button"><RotateCcw size={16} />重试</button>
        </div>
      ) : (
        <img
          ref={imageRef}
          alt={`作品预览图 ${props.index + 1}`}
          className={`pointer-events-none max-h-full max-w-full select-none rounded object-contain ${loading ? 'opacity-0' : 'opacity-100'}`}
          decoding="async"
          draggable={false}
          key={retryKey}
          src={source}
          onError={() => { setLoading(false); setFailed(true); }}
          onLoad={() => { setFailed(false); setLoading(false); }}
        />
      )}
    </div>
  );
}

function PreviewSlide(props: {
  readonly image: PreviewImage | undefined;
  readonly position: 'previous' | 'next';
  readonly offset: number;
  readonly animating: boolean;
}) {
  if (!props.image) return null;
  const base = props.position === 'previous' ? '-100%' : '100%';
  return (
    <div
      aria-hidden="true"
      className={slideClass(props.animating)}
      style={{ transform: `translate3d(calc(${base} + ${props.offset}px), 0, 0)` }}
    >
      <img
        alt=""
        className="pointer-events-none max-h-full max-w-full select-none rounded object-contain"
        decoding="async"
        draggable={false}
        src={imgUrl(props.image.large_url || props.image.thumb_url)}
      />
    </div>
  );
}

function slideClass(animating: boolean) {
  return `absolute inset-0 flex items-center justify-center ${animating ? 'transition-transform duration-[220ms] ease-out motion-reduce:transition-none' : 'transition-none'} will-change-transform`;
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
