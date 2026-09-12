/* global window, document, localStorage */
(() => {
  const valid = new Set(['system', 'harbor', 'graphite', 'paper', 'blueprint']);
  let preference = 'system';
  try {
    const stored = localStorage.getItem('javdb115-theme');
    if (stored && valid.has(stored)) preference = stored;
  } catch {
    // Storage is optional.
  }
  const resolved = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'harbor')
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
})();
