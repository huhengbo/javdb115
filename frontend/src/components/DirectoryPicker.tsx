import { Check, ChevronLeft, Folder, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
    if (selection) {
      onChange(selection);
    }
  }, [browser.items, onChange, selectedLabel, value]);

  function selectDirectory(selection: DirectorySelection) {
    onChange(selection);
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
          onSelect={selectDirectory}
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
      className="flex min-h-24 w-full items-center gap-3 rounded-lg border border-line bg-white p-4 text-left"
      onClick={props.onOpen}
      type="button"
    >
      <FolderOpen className="shrink-0 text-brand" size={22} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{props.label}</span>
        {props.helperText ? <span className="mt-1 block text-xs text-slate-500">{props.helperText}</span> : null}
        <span className="mt-2 block break-words text-sm text-slate-700">
          {selectedDisplay(props.value, props.selectedLabel)}
        </span>
      </span>
      <span className="shrink-0 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-ink">
        {props.value ? '更换' : '选择'}
      </span>
    </button>
  );
}

function DirectoryModal(props: {
  readonly browser: DirectoryBrowser;
  readonly label: string;
  readonly onClose: () => void;
  readonly onSelect: (selection: DirectorySelection) => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <div className="max-h-[86dvh] w-full overflow-hidden rounded-t-2xl bg-white sm:max-w-2xl sm:rounded-2xl">
        <DirectoryModalHeader label={props.label} onClose={props.onClose} />
        <div className="max-h-[calc(86dvh-64px)] overflow-y-auto p-4">
          <DirectoryToolbar
            browser={props.browser}
            onSelect={() => props.onSelect(currentSelection(props.browser))}
          />
          {props.browser.error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger" role="alert">{props.browser.error}</p> : null}
          <DirectoryList
            browser={props.browser}
            onSelect={(item) => props.onSelect(childSelection(props.browser.currentLabel, item))}
          />
        </div>
      </div>
    </div>
  );
}

function DirectoryModalHeader(props: { readonly label: string; readonly onClose: () => void }) {
  return (
    <div className="flex min-h-16 items-center justify-between border-b border-line px-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{props.label}</h2>
        <p className="mt-0.5 text-xs text-slate-500">浏览 115 目录并选择保存位置</p>
      </div>
      <button
        aria-label="关闭目录选择"
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500"
        onClick={props.onClose}
        type="button"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function DirectoryToolbar(props: {
  readonly browser: DirectoryBrowser;
  readonly onSelect: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">当前浏览</p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{props.browser.currentLabel}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ToolbarButton label="根目录" onClick={props.browser.goRoot} />
        <ToolbarButton disabled={!props.browser.canGoBack} icon={<ChevronLeft size={18} />} label="上级" onClick={props.browser.goBack} />
        <ToolbarButton disabled={props.browser.isLoading} icon={<RefreshCw size={16} />} label="刷新" onClick={props.browser.refresh} />
        <button
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={props.browser.isLoading}
          onClick={props.onSelect}
          type="button"
        >
          {props.browser.isLoading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
          选择当前
        </button>
      </div>
    </div>
  );
}

function ToolbarButton(props: {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line bg-white px-3 text-sm text-ink disabled:opacity-40"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function DirectoryList(props: {
  readonly browser: DirectoryBrowser;
  readonly onSelect: (item: DirectoryItem) => void;
}) {
  const { browser, onSelect } = props;
  if (browser.isLoading) {
    return <p className="mt-3 rounded-md border border-line p-3 text-sm text-slate-500">目录加载中...</p>;
  }
  if (browser.error) {
    return null;
  }
  if (browser.items.length === 0) {
    return <p className="mt-3 rounded-md border border-line p-3 text-sm text-slate-500">当前目录没有子目录</p>;
  }
  return (
    <div className="mt-3 max-h-[46dvh] space-y-2 overflow-y-auto pr-1">
      {browser.items.map((item) => (
        <DirectoryRow
          item={item}
          key={item.id}
          onOpen={browser.openDirectory}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DirectoryRow(props: {
  readonly item: DirectoryItem;
  readonly onOpen: (item: DirectoryItem) => void;
  readonly onSelect: (item: DirectoryItem) => void;
}) {
  return (
    <div className="flex min-h-14 w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left">
      <Folder className="shrink-0 text-slate-500" size={18} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{props.item.name}</span>
        {props.item.path ? <span className="block truncate text-xs text-slate-500">{props.item.path}</span> : null}
      </span>
      <button className="flex min-h-10 items-center gap-1 rounded-md px-2 text-sm text-brand" onClick={() => props.onOpen(props.item)} type="button">
        <FolderOpen size={16} />
        打开
      </button>
      <button className="flex min-h-10 items-center gap-1 rounded-md bg-slate-100 px-2 text-sm text-ink" onClick={() => props.onSelect(props.item)} type="button">
        <Check size={16} />
        选择
      </button>
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
    if (!isOpen) {
      return;
    }
    return loadDirectories(current.id, { setError, setIsLoading, setItems });
  }, [current.id, internalReloadKey, isOpen, reloadKey]);

  return {
    canGoBack: path.length > 1,
    current,
    currentLabel,
    error,
    isLoading,
    items,
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
  return () => {
    active = false;
  };

  function updateItems(directories: DirectoryItem[]) {
    if (active) {
      state.setItems(directories);
    }
  }

  function updateError(err: Error) {
    if (active) {
      state.setItems([]);
      state.setError(err.message);
    }
  }

  function stopLoading() {
    if (active) {
      state.setIsLoading(false);
    }
  }
}

function selectedDisplay(value: string, selectedLabel: string): string {
  if (!value) {
    return '未选择目录';
  }
  return resolvedLabel(selectedLabel) || '已选择目录，重新选择后会补全名称';
}

function currentSelection(browser: DirectoryBrowser): DirectorySelection {
  return { id: browser.current.id, label: browser.currentLabel };
}

function childSelection(parentLabel: string, item: DirectoryItem): DirectorySelection {
  return { id: item.id, label: childLabel(parentLabel, item.name) };
}

function formatPath(path: DirectoryCrumb[]): string {
  return path.map((item) => item.name).join(PATH_SEPARATOR);
}

function childLabel(parentLabel: string, childName: string): string {
  return [parentLabel, childName].filter(Boolean).join(PATH_SEPARATOR);
}

function inferSelectedRootDirectory(
  value: string,
  selectedLabel: string,
  items: DirectoryItem[]
): DirectorySelection | null {
  if (!value || resolvedLabel(selectedLabel)) {
    return null;
  }
  const item = items.find((directory) => directory.id === value);
  if (!item) {
    return null;
  }
  return { id: item.id, label: formatPath([ROOT_CRUMB, { id: item.id, name: item.name }]) };
}

function resolvedLabel(label: string): string {
  if (!label || label.startsWith(LEGACY_MANUAL_LABEL_PREFIX)) {
    return '';
  }
  return label;
}
