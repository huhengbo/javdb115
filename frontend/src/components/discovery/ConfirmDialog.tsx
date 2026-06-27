import { Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';

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
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-white p-4 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{props.title}</h2>
          <button
            aria-label="关闭确认弹窗"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500"
            onClick={props.onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 text-sm text-slate-600">{props.description}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-md border border-line px-3 text-sm font-medium text-ink"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60 ${confirmClass}`}
            disabled={props.busy}
            onClick={props.onConfirm}
            type="button"
          >
            {props.busy ? <Loader2 className="animate-spin" size={16} /> : null}
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
