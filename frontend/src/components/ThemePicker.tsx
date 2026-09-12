import { Check, ChevronDown, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../theme';

const OPTIONS: readonly { value: ThemePreference; label: string; caption: string; icon: ReactNode }[] = [
  { value: 'system', label: '跟随系统', caption: '浅色海盐青 / 深色石墨夜', icon: <Monitor size={16} /> },
  { value: 'harbor', label: '海盐青', caption: '清爽、轻量，默认品牌风格', icon: <Sun size={16} /> },
  { value: 'graphite', label: '石墨夜', caption: '深色低眩光，适合夜间使用', icon: <Moon size={16} /> },
  { value: 'paper', label: '暖纸', caption: '暖色低阴影，偏阅读体验', icon: <Palette size={16} /> },
  { value: 'blueprint', label: '高对比蓝图', caption: '边界更强，信息更紧凑', icon: <Palette size={16} /> }
];

export function ThemePicker() {
  const [value, setValue] = useState<ThemePreference>(readThemePreference);
  const [expanded, setExpanded] = useState(false);
  const selected = useMemo(() => OPTIONS.find((option) => option.value === value) ?? OPTIONS[0], [value]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ preference?: ThemePreference }>).detail;
      if (detail?.preference) setValue(detail.preference);
    };
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  function choose(next: ThemePreference) {
    setValue(next);
    setThemePreference(next);
    setExpanded(false);
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-line">
      <div>
        <h2 className="text-sm font-semibold text-ink">外观主题</h2>
        <p className="mt-1 text-xs text-slate-500">只保存在当前设备，不包含账号或敏感数据。</p>
      </div>
      <button aria-expanded={expanded} className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-xl bg-slate-50 px-3 text-left" onClick={() => setExpanded((current) => !current)} type="button">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand shadow-sm">{selected.icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{selected.label}</span><span className="block truncate text-xs text-slate-500">{selected.caption}</span></span>
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={18} />
      </button>
      {expanded ? <div className="mt-2 grid gap-1 rounded-xl bg-slate-50 p-1.5">{OPTIONS.map((option) => <button aria-label={option.label} aria-pressed={value === option.value} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-left ${value === option.value ? 'bg-teal-50 text-brand' : 'text-ink'}`} key={option.value} onClick={() => choose(option.value)} type="button"><span className="shrink-0">{option.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{option.label}</span><span className="block truncate text-xs text-slate-500">{option.caption}</span></span>{value === option.value ? <Check size={17} /> : null}</button>)}</div> : null}
    </section>
  );
}
