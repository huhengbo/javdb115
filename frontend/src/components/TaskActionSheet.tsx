import { Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { Task } from '../types';

type Props = {
  readonly task: Task;
  readonly onClose: () => void;
  readonly onDelete: () => void;
};

export function TaskActionSheet({ task, onClose, onDelete }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerStartedHere = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  function close() {
    // Close while still connected so the browser restores the opener's focus.
    dialogRef.current?.close();
    onClose();
  }

  function selectDelete() {
    dialogRef.current?.close();
    onDelete();
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/40 sm:flex sm:items-center sm:justify-center"
      ref={dialogRef}
      onPointerDownCapture={() => { pointerStartedHere.current = true; }}
      onPointerCancelCapture={() => { pointerStartedHere.current = false; }}
      onClickCapture={(event) => {
        // A long-press release can be retargeted to the newly opened modal.
        // Require a fresh press here, but retain keyboard/screen-reader clicks.
        if (event.detail !== 0 && !pointerStartedHere.current) {
          event.preventDefault();
          event.stopPropagation();
        }
        pointerStartedHere.current = false;
      }}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="fixed inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-xl sm:static sm:w-full sm:max-w-md sm:rounded-2xl">
        <h2 className="text-base font-semibold text-ink" id={titleId}>任务操作</h2>
        <p className="mt-1 truncate text-sm text-slate-500">{task.work?.code ?? `任务 #${task.id}`}</p>
        <button className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-danger active:bg-red-50" onClick={selectDelete} type="button"><Trash2 size={18} />删除记录</button>
        <button className="mt-2 min-h-12 w-full rounded-lg bg-slate-100 text-sm font-medium text-ink active:bg-slate-200" onClick={close} type="button">取消</button>
      </div>
    </dialog>
  );
}
