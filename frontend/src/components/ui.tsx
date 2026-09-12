import type { ReactNode } from 'react';

type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly meta?: string;
  readonly action?: ReactNode;
};

export function PageHeader({ title, description, meta, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
        {meta ? <p className="page-meta">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type SectionHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly trailing?: ReactNode;
};

export function SectionHeader({ title, description, trailing }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function Surface(props: { readonly children: ReactNode; readonly className?: string; readonly elevated?: boolean }) {
  return <div className={`${props.elevated ? 'ui-surface-elevated' : 'ui-surface'} ${props.className ?? ''}`.trim()}>{props.children}</div>;
}

export function FilterChip(props: { readonly selected: boolean; readonly children: ReactNode; readonly onClick: () => void; readonly ariaLabel?: string }) {
  return (
    <button
      aria-label={props.ariaLabel}
      aria-pressed={props.selected}
      className={`filter-chip ${props.selected ? 'filter-chip-selected' : ''}`}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function InlineAlert(props: { readonly children: ReactNode; readonly tone?: 'danger' | 'warning' | 'info' | 'success'; readonly className?: string }) {
  return <div className={`inline-alert inline-alert-${props.tone ?? 'info'} ${props.className ?? ''}`.trim()} role={props.tone === 'danger' ? 'alert' : 'status'}>{props.children}</div>;
}

export function EmptyState(props: { readonly title: string; readonly description?: string }) {
  return (
    <div className="empty-state">
      <p className="font-medium text-ink">{props.title}</p>
      {props.description ? <p className="mt-1 text-sm text-slate-500">{props.description}</p> : null}
    </div>
  );
}
