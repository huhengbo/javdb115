import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

type InstallChoice = {
  readonly outcome: 'accepted' | 'dismissed';
  readonly platform: string;
};

type BeforeInstallPromptEvent = Event & {
  readonly userChoice: Promise<InstallChoice>;
  prompt: () => Promise<void>;
};

type NavigatorWithStandalone = Navigator & {
  readonly standalone?: boolean;
};

export function PwaInstallPanel() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneMode);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <section aria-label="安装" className="settings-list-section">
        <h2 className="settings-section-title">安装</h2>
        <div className="settings-row">
          <span className="settings-row-label">应用</span>
          <span className="text-sm text-slate-500">已安装</span>
        </div>
      </section>
    );
  }

  if (installPrompt) {
    return (
      <section aria-label="安装" className="settings-list-section">
        <h2 className="settings-section-title">安装</h2>
        <div className="settings-row">
          <span className="settings-row-label">安装到手机</span>
          <button className="flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-brand" onClick={() => void requestInstall(installPrompt, setInstallPrompt)} type="button"><Download size={16} />安装</button>
        </div>
      </section>
    );
  }

  if (isIosDevice()) {
    return (
      <section aria-label="安装" className="settings-list-section">
        <h2 className="settings-section-title">安装</h2>
        <div className="settings-row items-start py-3">
          <span className="settings-row-label">添加到主屏幕</span>
          <span className="max-w-[12rem] text-right text-xs leading-5 text-slate-500">Safari 分享 → 添加到主屏幕</span>
        </div>
      </section>
    );
  }

  return null;
}

async function requestInstall(
  promptEvent: BeforeInstallPromptEvent,
  setInstallPrompt: (value: BeforeInstallPromptEvent | null) => void
) {
  await promptEvent.prompt();
  await promptEvent.userChoice;
  setInstallPrompt(null);
}

function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true;
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
