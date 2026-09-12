export type ThemePreference = 'system' | 'harbor' | 'graphite' | 'paper' | 'blueprint';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

const STORAGE_KEY = 'javdb115-theme';
const VALID_THEMES = new Set<ThemePreference>(['system', 'harbor', 'graphite', 'paper', 'blueprint']);

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return stored && VALID_THEMES.has(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'harbor';
}

export function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference);
  document.documentElement.dataset.themePreference = preference;
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Theme persistence is optional; the selected theme still applies for this session.
  }
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: { preference } }));
}

export function setupThemeListener() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = () => {
    if (readThemePreference() === 'system') applyTheme('system');
  };
  media.addEventListener('change', handleSystemChange);
  return () => media.removeEventListener('change', handleSystemChange);
}
