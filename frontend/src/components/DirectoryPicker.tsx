import { Check, ChevronLeft, Folder, FolderOpen, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { client } from '../api';
import type { DirectoryItem } from '../types';

export type DirectorySelection = {
  readonly id: string;
  readonly label: string;
};

type Props = {
  readonly label: string;
  readonly reloadKey: number;
  readonly value: string;
  readonly selectedLabel: string;
  readonly helperText?: string;
  readonly onChange: (selection: DirectorySelection) => void;
};

type DirectoryCrumb = {
  readonly id: string;
  readonly name: string;
};

type DirectoryLoadState = {
  readonly setError: (value: string | null) => void;
  readonly setIsLoading: (value: boolean) => void;
  readonly setItems: (items: DirectoryItem[]) => void;
};

type DirectoryBrowser = ReturnType<typeof useDirectoryBrowser>;

const ROOT_CRUMB: DirectoryCrumb = { id: '0', name: '根目录' };
const PATH_SEPARATOR = ' / ';
const LEGACY_MANUAL_LABEL_PREFIX = '手动填写：';

export function DirectoryPicker(props: Props) {
  const { label, reloadKey, value, selectedLabel, helperText, onChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const browser = useDirectoryBrowser(reloadKey, isOpen);

  useEffect(() => {
    const selection = inferSelectedRootDirectory(value, selectedLabel, browser.items);
    if (selection) onChange(selection);
  }, [browser.items, onChange, selectedLabel, value]);

  function selectCurrent() {
    onChange(currentSelection(browser));
    setIsOpen(false);
  }

  return (
    <section>
      <DirectoryTrigger
        helperText={helperText}
        label={label}
        selectedLabel={selectedLabel}
        value={value}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen ? (
        <DirectoryModal
          browser={browser}
          label={label}
          onClose={() => setIsOpen(false)}
          onSelect={selectCurrent}
        />
      ) : null}
    </section>
  );
}

function DirectoryTrigger(props: {
  readonly helperText?: string;
  readonly label: string;
  readonly selectedLabel: string;
  readonly value: string;
  readonly onOpen: () => void;
}) {
  return (
    <button
      aria-haspopup="dialog"
      className="flex min-h-24 w-full items-center gap-3 rounded-lg border border-line bg-white p-4 text-left active:bg-slate-50"
      onClick={props.onOpen}
      type="button"
    >
      <FolderOpen className="shrink-0 text-brand" size={22} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{props.label}</span>
        {props.helperText ? <span className="mt-1 block text-xs text-slate-500">{props.helperText}</span> : null}
        <span className="mt-2 block break-words text-sm text-slate-700">{selectedDisplay(props.value, props.selectedLabel)}</span>
      </span>
      <span className="shrink-0 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-ink">{props.value ? '更换' : '选择'}</span>
    </button>
  );
}

function DirectoryModal(props: {
  readonly browser: DirectoryBrowser;
  readonly label: string;
  readonly onClose: () => void;
  readonly onSelect: () => void;
}) {
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
      className="m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/60 sm:m-auto"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <div className="fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:static sm:h-[70dvh] sm:w-[40rem] sm:rounded-2xl">
        <DirectoryModalHeader browser={props.browser} label={props.label} titleId={titleId} onClose={props.onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">当前目录</p>
            <p className="mt-1 break-words text-sm font-medium text-ink" title={props.browser.currentLabel}>{props.browser.currentLabel}</p>
          </div>
          {props.browser.error ? (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">
              <p>{props.browser.error}</p>
              <button className="mt-2 min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm" onClick={props.browser.refresh} type="button">重试</button>
            </div>
          ) : null}
          <DirectoryList browser={props.browser} />
        </div>
        <div className="border-t border-line bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white active:opacity-85 disabled:opacity-60"
            disabled={props.browser.isLoading}
            onClick={props.onSelect}
            type="button"
          >
            {props.browser.isLoading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            选择当前目录
          </button>
        </div>
      </div>
    </dialog>
  );
}

function DirectoryModalHeader(props: {
  readonly browser: DirectoryBrowser;
  readonly label: string;
  readonly titleId: string;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
      <button aria-label="返回上级目录" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 disabled:opacity-30" disabled={!props.browser.canGoBack || props.browser.isLoading} onClick={props.browser.goBack} type="button"><ChevronLeft size={20} /></button>
      <div className="min-w-0 flex-1 px-1">
        <h2 className="truncate text-base font-semibold text-ink" id={props.titleId}>{props.label}</h2>
        <p className="truncate text-xs text-slate-500">{props.browser.current.name}</p>
      </div>
      <button aria-label="回到根目录" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 disabled:opacity-30" disabled={props.browser.path.length === 1 || props.browser.isLoading} onClick={props.browser.goRoot} type="button"><RotateCcw size={18} /></button>
      <button aria-label="刷新目录" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 disabled:opacity-30" disabled={props.browser.isLoading} onClick={props.browser.refresh} type="button"><RefreshCw className={props.browser.isLoading ? 'animate-spin' : ''} size={18} /></button>
      <button aria-label="关闭目录选择" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500" onClick={props.onClose} type="button"><X size={18} /></button>
    </div>
  );
}

function DirectoryList({ browser }: { readonly browser: DirectoryBrowser }) {
  if (browser.isLoading) {
    return <p className="mt-3 flex min-h-20 items-center justify-center gap-2 rounded-md border border-line text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />目录加载中...</p>;
  }
  if (browser.error) return null;
  if (browser.items.length === 0) {
    return <p className="mt-3 rounded-md border border-line p-4 text-sm text-slate-500">当前目录没有子目录，可直接选择当前目录。</p>;
  }
  return (
    <div className="mt-3 space-y-2">
      {browser.items.map((item) => (
        <button
          className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left active:bg-slate-50 disabled:opacity-50"
          disabled={browser.isLoading}
          key={item.id}
          onClick={() => browser.openDirectory(item)}
          type="button"
        >
          <Folder className="shrink-0 text-slate-500" size={19} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
            {item.path ? <span className="block truncate text-xs text-slate-500">{item.path}</span> : null}
          </span>
          <FolderOpen className="shrink-0 text-brand" size={18} />
        </button>
      ))}
    </div>
  );
}

function useDirectoryBrowser(reloadKey: number, isOpen: boolean) {
  const [path, setPath] = useState<DirectoryCrumb[]>([ROOT_CRUMB]);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalReloadKey, setInternalReloadKey] = useState(0);
  const current = path[path.length - 1];
  const currentLabel = useMemo(() => formatPath(path), [path]);

  useEffect(() => {
    if (!isOpen) return;
    return loadDirectories(current.id, { setError, setIsLoading, setItems });
  }, [current.id, internalReloadKey, isOpen, reloadKey]);

  return {
    canGoBack: path.length > 1,
    current,
    currentLabel,
    error,
    isLoading,
    items,
    path,
    goBack: () => setPath((currentPath) => currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath),
    goRoot: () => setPath([ROOT_CRUMB]),
    openDirectory: (item: DirectoryItem) => setPath((currentPath) => [...currentPath, { id: item.id, name: item.name }]),
    refresh: () => setInternalReloadKey((currentValue) => currentValue + 1)
  };
}

function loadDirectories(parentId: string, state: DirectoryLoadState) {
  let active = true;
  state.setIsLoading(true);
  state.setError(null);
  client.directories(parentId).then(updateItems).catch(updateError).finally(stopLoading);
  return () => { active = false; };

  function updateItems(directories: DirectoryItem[]) {
    if (active) state.setItems(directories);
  }
  function updateError(err: Error) {
    if (active) {
      state.setItems([]);
      state.setError(err.message);
    }
  }
  function stopLoading() {
    if (active) state.setIsLoading(false);
  }
}

function selectedDisplay(value: string, selectedLabel: string): string {
  if (!value) return '未选择目录';
  return resolvedLabel(selectedLabel) || '已选择目录，重新选择后会补全名称';
}

function currentSelection(browser: DirectoryBrowser): DirectorySelection {
  return { id: browser.current.id, label: browser.currentLabel };
}

function formatPath(path: DirectoryCrumb[]): string {
  return path.map((item) => item.name).join(PATH_SEPARATOR);
}

function inferSelectedRootDirectory(value: string, selectedLabel: string, items: DirectoryItem[]): DirectorySelection | null {
  if (!value || resolvedLabel(selectedLabel)) return null;
  const item = items.find((directory) => directory.id === value);
  if (!item) return null;
  return { id: item.id, label: formatPath([ROOT_CRUMB, { id: item.id, name: item.name }]) };
}

function resolvedLabel(label: string): string {
  if (!label || label.startsWith(LEGACY_MANUAL_LABEL_PREFIX)) return '';
  return label;
}
