import type { MagnetItem } from '../../types';
import { formatMagnetSize } from '../../lib/javdb';

type Props = {
  readonly magnets: MagnetItem[];
  readonly onSelect: (magnet: MagnetItem) => void;
};

export function MagnetList({ magnets, onSelect }: Props) {
  if (magnets.length === 0) {
    return null;
  }
  return (
    <section className="mt-5">
      <h3 className="text-sm font-medium text-ink">磁力链接 ({magnets.length})</h3>
      <div className="mt-2 space-y-2">
        {magnets.map((magnet, index) => (
          <MagnetCard isBest={index === 0} key={magnet.hash} magnet={magnet} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function MagnetCard({ isBest, magnet, onSelect }: { readonly isBest: boolean; readonly magnet: MagnetItem; readonly onSelect: Props['onSelect'] }) {
  return (
    <article className="rounded-lg border border-line bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isBest ? <p className="mb-1 text-xs font-medium text-brand">推荐磁力</p> : null}
          <a
            className="break-all font-mono text-xs text-ink underline decoration-slate-300 underline-offset-2"
            href={magnetHref(magnet)}
          >
            {magnet.name}
          </a>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{formatMagnetSize(magnet.size)}</span>
            <span>{magnet.created_at}</span>
            {magnet.cnsub ? <span className="text-emerald-600">中文字幕</span> : null}
            {magnet.hd ? <span className="text-blue-600">高清</span> : null}
          </div>
        </div>
        <button
          className="min-h-11 shrink-0 rounded-md bg-brand px-3 text-sm font-medium text-white"
          onClick={() => onSelect(magnet)}
          type="button"
        >
          离线下载
        </button>
      </div>
    </article>
  );
}

function magnetHref(magnet: MagnetItem): string {
  return magnet.url || `magnet:?xt=urn:btih:${magnet.hash}&dn=${encodeURIComponent(magnet.name)}`;
}
