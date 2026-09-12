import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { MagnetItem } from '../../types';
import { formatMagnetSize } from '../../lib/javdb';

type Props = {
  readonly magnets: MagnetItem[];
  readonly onSelect: (magnet: MagnetItem) => void;
};

const INITIAL_VISIBLE = 3;

export function MagnetList({ magnets, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (magnets.length === 0) return null;
  const visible = expanded ? magnets : magnets.slice(0, INITIAL_VISIBLE);
  const hiddenCount = magnets.length - visible.length;

  async function copyMagnet(magnet: MagnetItem) {
    try {
      await navigator.clipboard.writeText(magnetHref(magnet));
      setFeedback(`已复制：${magnet.name}`);
    } catch {
      setFeedback('复制失败，请使用“外部打开”或手动复制。');
    }
  }

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">磁力链接 ({magnets.length})</h3>
        {magnets.length > INITIAL_VISIBLE ? (
          <button className="min-h-10 px-2 text-xs text-brand" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? '收起候选' : `查看其余 ${magnets.length - INITIAL_VISIBLE} 条`}</button>
        ) : null}
      </div>
      {feedback ? <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600" role="status">{feedback}</p> : null}
      <div className="mt-2 space-y-2">
        {visible.map((magnet, index) => (
          <MagnetCard isBest={index === 0} key={magnet.hash} magnet={magnet} onCopy={copyMagnet} onSelect={onSelect} />
        ))}
      </div>
      {!expanded && hiddenCount > 0 ? <p className="mt-2 text-center text-xs text-slate-400">还有 {hiddenCount} 条候选磁力</p> : null}
    </section>
  );
}

function MagnetCard(props: {
  readonly isBest: boolean;
  readonly magnet: MagnetItem;
  readonly onCopy: (magnet: MagnetItem) => void | Promise<void>;
  readonly onSelect: Props['onSelect'];
}) {
  const { isBest, magnet, onCopy, onSelect } = props;
  return (
    <article className="rounded-lg border border-line bg-slate-50 p-3">
      {isBest ? <p className="mb-1 text-xs font-medium text-brand">推荐磁力</p> : null}
      <p className="break-all font-mono text-xs text-ink">{magnet.name}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-line">{formatMagnetSize(magnet.size)}</span>
        {magnet.cnsub ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">中文字幕</span> : null}
        {magnet.hd ? <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">高清</span> : null}
        {magnet.created_at ? <span className="px-1 py-1">{magnet.created_at}</span> : null}
      </div>
      <button className="mt-3 min-h-12 w-full rounded-md bg-brand px-3 text-sm font-medium text-white active:opacity-85" onClick={() => onSelect(magnet)} type="button">提交到 115</button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="flex min-h-10 items-center justify-center gap-1 rounded-md border border-line bg-white text-xs text-slate-600" onClick={() => void onCopy(magnet)} type="button"><Copy size={14} />复制磁力</button>
        <a className="flex min-h-10 items-center justify-center gap-1 rounded-md border border-line bg-white text-xs text-slate-600" href={magnetHref(magnet)}><ExternalLink size={14} />外部打开</a>
      </div>
    </article>
  );
}

function magnetHref(magnet: MagnetItem): string {
  return magnet.url || `magnet:?xt=urn:btih:${magnet.hash}&dn=${encodeURIComponent(magnet.name)}`;
}
