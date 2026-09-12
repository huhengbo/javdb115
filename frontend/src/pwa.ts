let registration: ServiceWorkerRegistration | null = null;
let reloadOnControllerChange = false;

export function setupPwa() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) {
      window.location.reload();
    }
  });

  void navigator.serviceWorker.register('/sw.js')
    .then((nextRegistration) => {
      registration = nextRegistration;
      if (nextRegistration.waiting && navigator.serviceWorker.controller) {
        notifyUpdateAvailable();
      }
      nextRegistration.addEventListener('updatefound', () => {
        const worker = nextRegistration.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdateAvailable();
          }
        });
      });
    })
    .catch((error) => {
      console.error('PWA service worker registration failed', error);
    });
}

export async function applyPwaUpdate() {
  if (!registration) {
    return;
  }
  if (!registration.waiting) {
    await registration.update();
  }
  if (!registration.waiting) {
    return;
  }
  reloadOnControllerChange = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

function notifyUpdateAvailable() {
  window.dispatchEvent(new Event('pwa-update-available'));
}
