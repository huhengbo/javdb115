import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../theme';

const OPTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: '自动', icon: Monitor },
  { value: 'light', label: '白天', icon: Sun },
  { value: 'dark', label: '夜间', icon: Moon }
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
    <section aria-label="外观" className="settings-list-section">
      <h2 className="settings-section-title">外观</h2>
      <div className="settings-row">
        <span className="settings-row-label">显示模式</span>
        <div className="appearance-toggle" role="group" aria-label="显示模式">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = value === option.value;
            return (
              <button
                aria-pressed={selected}
                className={`appearance-toggle-item ${selected ? 'appearance-toggle-item-selected' : ''}`}
                key={option.value}
                onClick={() => choose(option.value)}
                type="button"
              >
                <Icon aria-hidden="true" size={15} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
