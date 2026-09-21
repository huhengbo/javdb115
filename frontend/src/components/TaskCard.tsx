import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-long-press]';

type Props = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly onActions: () => void;
};

/** Keep browser scrolling; only a stationary primary press opens actions. */
export function TaskCard(props: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  function cancelPress() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pointer.current = null;
  }

  useEffect(() => {
    window.addEventListener('blur', cancelPress);
    window.addEventListener('scroll', cancelPress, true);
    return () => {
      cancelPress();
      window.removeEventListener('blur', cancelPress);
      window.removeEventListener('scroll', cancelPress, true);
    };
  }, []);

  function startPress(event: PointerEvent<HTMLElement>) {
    cancelPress();
    suppressClick.current = false;
    if (!event.isPrimary || event.button !== 0 || isInteractive(event.target)) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      pointer.current = null;
      suppressClick.current = true;
      props.onActions();
    }, LONG_PRESS_MS);
  }

  function movePress(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || event.pointerId !== start.id) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= MOVE_TOLERANCE) {
      suppressClick.current = true;
      cancelPress();
    }
  }

  function captureClick(event: MouseEvent<HTMLElement>) {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <article
      aria-label={props.label}
      className={`quiet-list-item touch-manipulation ${props.className ?? ''}`}
      onClick={props.onClick}
      onClickCapture={captureClick}
      onContextMenu={(event) => {
        if (isInteractive(event.target)) return;
        event.preventDefault();
        cancelPress();
        suppressClick.current = true;
        props.onActions();
      }}
      onPointerDown={startPress}
      onPointerMove={movePress}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {props.children}
    </article>
  );
}

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}
