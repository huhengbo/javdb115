import { Download, Share2, Smartphone } from 'lucide-react';
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
      <section className="mb-4 rounded-lg border border-line bg-white p-4">
        <div className="flex items-center gap-3">
          <Smartphone className="shrink-0 text-brand" size={22} />
          <div>
            <h2 className="text-sm font-medium text-ink">已安装到手机</h2>
            <p className="mt-1 text-xs text-slate-500">当前正以独立应用模式运行。</p>
          </div>
        </div>
      </section>
    );
  }

  if (installPrompt) {
    return (
      <section className="mb-4 rounded-lg border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 shrink-0 text-brand" size={22} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-ink">安装到手机</h2>
            <p className="mt-1 text-xs text-slate-500">安装后可从桌面图标直接打开，不需要先进入浏览器。</p>
            <button
              className="mt-3 min-h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white"
              onClick={() => void requestInstall(installPrompt, setInstallPrompt)}
              type="button"
            >
              安装应用
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (isIosDevice()) {
    return (
      <section className="mb-4 rounded-lg border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 shrink-0 text-brand" size={22} />
          <div>
            <h2 className="text-sm font-medium text-ink">添加到 iPhone / iPad 主屏幕</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">在 Safari 中点“分享”，再选择“添加到主屏幕”。</p>
          </div>
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
