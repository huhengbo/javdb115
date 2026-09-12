import { registerSW } from 'virtual:pwa-register';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;

export function setupPwa() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new Event('pwa-update-available'));
    },
    onOfflineReady() {
      window.dispatchEvent(new Event('pwa-offline-ready'));
    },
    onRegisterError(error) {
      console.error('PWA service worker registration failed', error);
    }
  });
}

export async function applyPwaUpdate() {
  if (updateServiceWorker) {
    await updateServiceWorker(true);
  }
}
