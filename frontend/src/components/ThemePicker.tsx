import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
  }

  return (
    <section className="mb-4 rounded-lg border border-line bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">外观主题</h2>
        <p className="mt-1 text-xs text-slate-500">只保存在当前设备，不包含账号或敏感数据。</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={`min-h-16 rounded-lg border p-3 text-left ${value === option.value ? 'border-brand bg-teal-50 ring-1 ring-brand' : 'border-line bg-white'}`}
            key={option.value}
            onClick={() => choose(option.value)}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">{option.icon}{option.label}</span>
            <span className="mt-1 block text-xs text-slate-500">{option.caption}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
