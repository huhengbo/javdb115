import type { ReactNode } from 'react';

const DEFAULT_FILTER_RULES = {
  min_size_gb: 1,
  required_keywords: [],
  excluded_keywords: []
} as const;

export type FieldProps = {
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
};

export function SettingsGroup(props: { readonly caption: string; readonly children: ReactNode; readonly title: string }) {
  return (
    <section className="py-2">
      <h2 className="text-base font-semibold text-ink">{props.title}</h2>
      <p className="mt-1 text-xs text-slate-500">{props.caption}</p>
      <div className="mt-4 space-y-3">{props.children}</div>
    </section>
  );
}

export function CookieField(props: FieldProps) {
  return (
    <TextAreaField
      fieldKey="p115_cookie"
      label="115 Cookie"
      rowsClassName="min-h-24"
      values={props.values}
      onChange={props.onChange}
    />
  );
}

export function TelegramFields(props: FieldProps) {
  return (
    <div className="grid gap-3">
      <TextAreaField
        fieldKey="telegram_bot_token"
        label="Bot Token"
        rowsClassName="min-h-16"
        values={props.values}
        onChange={props.onChange}
      />
      <SingleLineField fieldKey="telegram_chat_id" label="Chat ID（可空）" values={props.values} onChange={props.onChange} />
    </div>
  );
}

export function SingleLineField(props: FieldProps & { readonly fieldKey: string; readonly label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <input
        className="mt-2 min-h-11 w-full rounded-md border border-line px-3 text-sm"
        onChange={(event) => props.onChange(props.fieldKey, event.target.value)}
        value={props.values[props.fieldKey] ?? ''}
      />
    </label>
  );
}

export function FilterRulesEditor({ onChange, value }: { readonly onChange: (value: string) => void; readonly value: string }) {
  const parsed = parseFilterRules(value);
  if (!parsed.ok) {
    return (
      <label className="block">
        <span className="text-sm font-medium text-ink">过滤规则 JSON</span>
        <textarea
          className="mt-2 min-h-32 w-full rounded-md border border-red-200 px-3 py-2 text-sm"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
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

function TextAreaField(props: FieldProps & { readonly fieldKey: string; readonly label: string; readonly rowsClassName: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <textarea
        className={`mt-2 w-full rounded-md border border-line px-3 py-2 text-sm ${props.rowsClassName}`}
        onChange={(event) => props.onChange(props.fieldKey, event.target.value)}
        value={props.values[props.fieldKey] ?? ''}
      />
    </label>
  );
}

function StructuredFilterRules({ onChange, rules }: { readonly onChange: (value: string) => void; readonly rules: FilterRules }) {
  return (
    <div className="grid gap-3">
      <label className="block">
        <span className="text-sm font-medium text-ink">最小体积（GB）</span>
        <input
          className="mt-2 min-h-11 w-full rounded-md border border-line px-3 text-sm"
          min="0"
          onChange={(event) => updateRules(onChange, rules, { min_size_gb: Number(event.target.value) })}
          step="0.1"
          type="number"
          value={rules.min_size_gb}
        />
      </label>
      <KeywordField
        label="必须包含关键词"
        value={rules.required_keywords}
        onChange={(keywords) => updateRules(onChange, rules, { required_keywords: keywords })}
      />
      <KeywordField
        label="排除关键词"
        value={rules.excluded_keywords}
        onChange={(keywords) => updateRules(onChange, rules, { excluded_keywords: keywords })}
      />
    </div>
  );
}

function KeywordField(props: { readonly label: string; readonly onChange: (keywords: string[]) => void; readonly value: readonly string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{props.label}</span>
      <textarea
        className="mt-2 min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
        onChange={(event) => props.onChange(splitKeywords(event.target.value))}
        placeholder="每行一个关键词"
        value={props.value.join('\n')}
      />
    </label>
  );
}

function parseFilterRules(value: string): { ok: true; rules: FilterRules } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(value || JSON.stringify(DEFAULT_FILTER_RULES)) as Partial<FilterRules>;
    return {
      ok: true,
      rules: {
        min_size_gb: Number(parsed.min_size_gb ?? DEFAULT_FILTER_RULES.min_size_gb),
        required_keywords: Array.isArray(parsed.required_keywords) ? parsed.required_keywords.map(String) : [],
        excluded_keywords: Array.isArray(parsed.excluded_keywords) ? parsed.excluded_keywords.map(String) : []
      }
    };
  } catch (err) {
    return { ok: false, message: `JSON 解析失败：${(err as Error).message}` };
  }
}

function splitKeywords(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function updateRules(onChange: (value: string) => void, current: FilterRules, patch: Partial<FilterRules>) {
  onChange(JSON.stringify({ ...current, ...patch }));
}
