/* global window */
(() => {
  let preference = 'system';
  try {
    const stored = localStorage.getItem('javdb115-theme');
    if (stored === 'system' || stored === 'light' || stored === 'dark') preference = stored;
    else if (stored === 'graphite') preference = 'dark';
    else if (stored === 'harbor' || stored === 'paper' || stored === 'blueprint') preference = 'light';
  } catch {
    // Storage is optional.
  }

  const resolved = preference === 'dark'
    ? 'graphite'
    : preference === 'light'
      ? 'harbor'
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'harbor');

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
})();
