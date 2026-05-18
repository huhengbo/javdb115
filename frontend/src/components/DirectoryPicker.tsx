import { Check, ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
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

const ROOT_CRUMB: DirectoryCrumb = { id: '0', name: '根目录' };
const PATH_SEPARATOR = ' / ';
const MANUAL_LABEL_PREFIX = '手动填写：';

export function DirectoryPicker(props: Props) {
  const { label, reloadKey, value, selectedLabel, onChange } = props;
  const inputId = useId();
  const browser = useDirectoryBrowser(reloadKey);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const selection = inferSelectedRootDirectory(value, selectedLabel, browser.items);
    if (selection) {
      onChange(selection);
    }
  }, [browser.items, onChange, selectedLabel, value]);

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">{label}</h2>
        <button
          className="flex min-h-10 items-center gap-1 rounded-md border border-line px-2 text-xs text-slate-600"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {expanded ? '收起选择器' : '选择目录'}
        </button>
      </div>
      <SelectedDirectory id={value} label={selectedLabel} />
      {expanded ? (
        <>
          <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor={inputId}>手动填写目录 ID</label>
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-line px-3 text-sm"
            id={inputId}
            onChange={(event) => onChange({ id: event.target.value, label: manualLabel(event.target.value) })}
            placeholder="填写 115 目录 ID"
            value={value}
          />
          <DirectoryToolbar
            canGoBack={browser.canGoBack}
            currentId={browser.current.id}
            currentLabel={browser.currentLabel}
            isLoading={browser.isLoading}
            onBack={browser.goBack}
            onRefresh={browser.refresh}
            onRoot={browser.goRoot}
            onSelect={() => onChange({ id: browser.current.id, label: browser.currentLabel })}
          />
          {browser.error ? <p className="mt-2 text-sm text-danger">{browser.error}</p> : null}
          <DirectoryList
            error={browser.error}
            isLoading={browser.isLoading}
            items={browser.items}
            onOpen={browser.openDirectory}
            onSelect={(item) => onChange({ id: item.id, label: childLabel(browser.currentLabel, item.name) })}
          />
        </>
      ) : null}
    </section>
  );
}

function useDirectoryBrowser(reloadKey: number) {
  const [path, setPath] = useState<DirectoryCrumb[]>([ROOT_CRUMB]);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalReloadKey, setInternalReloadKey] = useState(0);
  const current = path[path.length - 1];
  const currentLabel = useMemo(() => formatPath(path), [path]);

  useEffect(
    () => loadDirectories(current.id, { setError, setIsLoading, setItems }),
    [current.id, internalReloadKey, reloadKey]
  );

  return {
    canGoBack: path.length > 1,
    current,
    currentLabel,
    error,
    isLoading,
    items,
    goBack: () => setPath((currentPath) => currentPath.slice(0, -1)),
    goRoot: () => setPath([ROOT_CRUMB]),
    openDirectory: (item: DirectoryItem) => {
      setPath((currentPath) => [...currentPath, { id: item.id, name: item.name }]);
    },
    refresh: () => setInternalReloadKey((currentValue) => currentValue + 1)
  };
}

function loadDirectories(
  parentId: string,
  state: DirectoryLoadState
) {
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

function SelectedDirectory({ id, label }: DirectorySelection) {
  const display = label || (id ? '仅保存了目录 ID，可重新选择目录补全名称' : '未选择目录');
  return (
    <div className="mt-2 rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">已选目录</p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{display}</p>
      {id ? <p className="mt-1 break-all text-xs text-slate-500">ID/路径：{id}</p> : null}
    </div>
  );
}

type DirectoryToolbarProps = {
  readonly canGoBack: boolean;
  readonly currentId: string;
  readonly currentLabel: string;
  readonly isLoading: boolean;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onRoot: () => void;
  readonly onSelect: () => void;
};

function DirectoryToolbar(props: DirectoryToolbarProps) {
  return (
    <div className="mt-3 rounded-md border border-line bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">当前浏览</p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{props.currentLabel}</p>
      <p className="mt-1 break-all text-xs text-slate-500">ID：{props.currentId}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="min-h-11 rounded-md border border-line bg-white px-3" onClick={props.onRoot} type="button">根目录</button>
        <button className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line bg-white px-3 disabled:opacity-40" disabled={!props.canGoBack} onClick={props.onBack} type="button">
          <ChevronLeft size={18} />
          上级
        </button>
        <button className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line bg-white px-3 disabled:opacity-60" disabled={props.isLoading} onClick={props.onRefresh} type="button">
          <RefreshCw size={16} />
          刷新
        </button>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 font-medium text-white disabled:opacity-60" disabled={props.isLoading} onClick={props.onSelect} type="button">
          {props.isLoading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
          选择当前目录
        </button>
      </div>
    </div>
  );
}

type DirectoryListProps = {
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly items: DirectoryItem[];
  readonly onOpen: (item: DirectoryItem) => void;
  readonly onSelect: (item: DirectoryItem) => void;
};

function DirectoryList({ error, isLoading, items, onOpen, onSelect }: DirectoryListProps) {
  if (isLoading) {
    return <p className="mt-3 rounded-md border border-line p-3 text-sm text-slate-500">目录加载中...</p>;
  }
  if (error) {
    return null;
  }
  if (items.length === 0) {
    return <p className="mt-3 rounded-md border border-line p-3 text-sm text-slate-500">当前目录没有子目录</p>;
  }
  return (
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
      {items.map((item) => (
        <div className="flex min-h-12 w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left" key={item.id}>
          <Folder size={18} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
            {item.path ? <span className="block truncate text-xs text-slate-500">{item.path}</span> : null}
          </span>
          <button className="flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-brand" onClick={() => onOpen(item)} type="button">
            <FolderOpen size={16} />
            打开
          </button>
          <button className="flex min-h-9 items-center gap-1 rounded-md bg-slate-100 px-2 text-sm text-ink" onClick={() => onSelect(item)} type="button">
            <Check size={16} />
            选择
          </button>
        </div>
      ))}
    </div>
  );
}

function formatPath(path: DirectoryCrumb[]): string {
  return path.map((item) => item.name).join(PATH_SEPARATOR);
}

function childLabel(parentLabel: string, childName: string): string {
  return [parentLabel, childName].filter(Boolean).join(PATH_SEPARATOR);
}

function manualLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${MANUAL_LABEL_PREFIX}${trimmed}` : '';
}

function inferSelectedRootDirectory(
  value: string,
  selectedLabel: string,
  items: DirectoryItem[]
): DirectorySelection | null {
  if (!value || isResolvedLabel(selectedLabel)) {
    return null;
  }
  const item = items.find((directory) => directory.id === value);
  if (!item) {
    return null;
  }
  return { id: item.id, label: formatPath([ROOT_CRUMB, { id: item.id, name: item.name }]) };
}

function isResolvedLabel(label: string): boolean {
  return Boolean(label && !label.startsWith(MANUAL_LABEL_PREFIX));
}
