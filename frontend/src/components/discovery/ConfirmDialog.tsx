import { Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly danger?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

export function ConfirmDialog(props: Props) {
  const confirmClass = props.danger ? 'bg-danger text-white' : 'bg-brand text-white';
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/60 sm:flex sm:items-center sm:justify-center"
      ref={dialogRef}
      onCancel={(event) => {
        if (props.busy) {
          event.preventDefault();
          return;
        }
        props.onCancel();
      }}
    >
      <div className="fixed inset-x-0 bottom-0 w-full rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-xl sm:static sm:max-w-md sm:rounded-2xl sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink" id={titleId}>{props.title}</h2>
          <button
            aria-label="关闭确认弹窗"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 disabled:opacity-40"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 max-h-[55dvh] overflow-y-auto overscroll-contain text-sm text-slate-600">{props.description}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-md border border-line px-3 text-sm font-medium text-ink active:bg-slate-50 disabled:opacity-40"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium active:opacity-85 disabled:opacity-60 ${confirmClass}`}
            disabled={props.busy}
            onClick={props.onConfirm}
            type="button"
          >
            {props.busy ? <Loader2 className="animate-spin" size={16} /> : null}
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
