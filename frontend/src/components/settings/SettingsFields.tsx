import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

const DEFAULT_FILTER_RULES = {
  min_size_gb: 1,
  required_keywords: [],
  excluded_keywords: []
} as const;

export type FieldProps = {
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
};

export function SettingsGroup(props: { readonly caption?: string; readonly children: ReactNode; readonly title: string }) {
  const [expanded, setExpanded] = useState(props.title === '115 账号' || props.title === '目录');
  return (
    <section className="border-b border-line">
      <button aria-expanded={expanded} className="flex min-h-14 w-full items-center gap-3 py-3 text-left" onClick={() => setExpanded((current) => !current)} type="button">
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{props.title}</span>
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={17} />
      </button>
      {expanded ? <div className="space-y-4 pb-5">{props.children}</div> : null}
    </section>
  );
}

export function CookieField(props: FieldProps) {
  return <TextAreaField fieldKey="p115_cookie" label="115 Cookie" placeholder="输入新值以设置或覆盖现有 Cookie" rowsClassName="min-h-24" values={props.values} onChange={props.onChange} />;
}

export function TelegramFields(props: FieldProps) {
  return (
    <div className="grid gap-4">
      <TextAreaField fieldKey="telegram_bot_token" label="Bot Token" placeholder="输入新值以设置或覆盖现有 Token" rowsClassName="min-h-16" values={props.values} onChange={props.onChange} />
      <SingleLineField fieldKey="telegram_chat_id" label="Chat ID（可空）" values={props.values} onChange={props.onChange} />
    </div>
  );
}

export function SingleLineField(props: FieldProps & { readonly fieldKey: string; readonly label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <input className="field-control mt-2 text-sm" onChange={(event) => props.onChange(props.fieldKey, event.target.value)} value={props.values[props.fieldKey] ?? ''} />
    </label>
  );
}

export function FilterRulesEditor({ onChange, value }: { readonly onChange: (value: string) => void; readonly value: string }) {
  const parsed = parseFilterRules(value);
  if (!parsed.ok) {
    return (
      <label className="block">
        <span className="text-sm font-medium text-ink">过滤规则 JSON</span>
        <textarea className="mt-2 min-h-32 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-ink" onChange={(event) => onChange(event.target.value)} value={value} />
        <span className="mt-2 block text-xs text-danger">{parsed.message}</span>
      </label>
    );
  }
  return <StructuredFilterRules rules={parsed.rules} onChange={onChange} />;
}

type FilterRules = {
  readonly min_size_gb: number;
  readonly required_keywords: string[];
  readonly excluded_keywords: string[];
};

function TextAreaField(props: FieldProps & { readonly fieldKey: string; readonly label: string; readonly placeholder?: string; readonly rowsClassName: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <textarea className={`mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink ${props.rowsClassName}`} onChange={(event) => props.onChange(props.fieldKey, event.target.value)} placeholder={props.placeholder} value={props.values[props.fieldKey] ?? ''} />
      {props.placeholder ? <span className="mt-1 block text-xs text-slate-500">敏感值不会从服务器回显；留空时保持现有值。</span> : null}
    </label>
  );
}

function StructuredFilterRules({ onChange, rules }: { readonly onChange: (value: string) => void; readonly rules: FilterRules }) {
  return (
    <div className="grid gap-4">
      <NumberRuleField value={rules.min_size_gb} onCommit={(value) => updateRules(onChange, rules, { min_size_gb: value })} />
      <KeywordField label="必须包含关键词" value={rules.required_keywords} onChange={(keywords) => updateRules(onChange, rules, { required_keywords: keywords })} />
      <KeywordField label="排除关键词" value={rules.excluded_keywords} onChange={(keywords) => updateRules(onChange, rules, { excluded_keywords: keywords })} />
    </div>
  );
}

function NumberRuleField(props: { readonly value: number; readonly onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(props.value));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => setDraft(String(props.value)), [props.value]);

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setError('请输入大于或等于 0 的数字');
      return;
    }
    setError(null);
    props.onCommit(parsed);
  }

  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">最小体积（GB）</span>
      <input aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className={`field-control mt-2 text-sm ${error ? 'border-red-300' : ''}`} inputMode="decimal" min="0" onBlur={commit} onChange={(event) => { setDraft(event.target.value); if (error) setError(null); }} step="0.1" type="number" value={draft} />
      {error ? <span className="mt-1 block text-xs text-danger" id={errorId}>{error}</span> : null}
    </label>
  );
}

function KeywordField(props: { readonly label: string; readonly onChange: (keywords: string[]) => void; readonly value: readonly string[] }) {
  const normalized = props.value.join('\n');
  const [draft, setDraft] = useState(normalized);
  useEffect(() => setDraft(normalized), [normalized]);
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <textarea className="mt-2 min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" onBlur={() => props.onChange(splitKeywords(draft))} onChange={(event) => setDraft(event.target.value)} placeholder="每行一个关键词" value={draft} />
    </label>
  );
}

function parseFilterRules(value: string): { ok: true; rules: FilterRules } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(value || JSON.stringify(DEFAULT_FILTER_RULES)) as Partial<FilterRules>;
    return { ok: true, rules: { min_size_gb: Number(parsed.min_size_gb ?? DEFAULT_FILTER_RULES.min_size_gb), required_keywords: Array.isArray(parsed.required_keywords) ? parsed.required_keywords.map(String) : [], excluded_keywords: Array.isArray(parsed.excluded_keywords) ? parsed.excluded_keywords.map(String) : [] } };
  } catch (err) {
    return { ok: false, message: `JSON 解析失败：${(err as Error).message}` };
  }
}

function splitKeywords(value: string): string[] { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function updateRules(onChange: (value: string) => void, current: FilterRules, patch: Partial<FilterRules>) { onChange(JSON.stringify({ ...current, ...patch })); }
