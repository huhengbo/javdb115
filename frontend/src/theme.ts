export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'harbor' | 'graphite';

const STORAGE_KEY = 'javdb115-theme';
const VALID_THEMES = new Set<ThemePreference>(['system', 'light', 'dark']);

function migrateLegacyPreference(value: string | null): ThemePreference | null {
  if (!value) return null;
  if (VALID_THEMES.has(value as ThemePreference)) return value as ThemePreference;
  if (value === 'graphite') return 'dark';
  if (value === 'harbor' || value === 'paper' || value === 'blueprint') return 'light';
  return null;
}

export function readThemePreference(): ThemePreference {
  try {
    return migrateLegacyPreference(localStorage.getItem(STORAGE_KEY)) ?? 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light') return 'harbor';
  if (preference === 'dark') return 'graphite';
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
    // Appearance persistence is optional; the selected mode still applies for this session.
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
