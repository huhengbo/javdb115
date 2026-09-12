import { Activity, Compass, Heart, Home, LogOut, Settings, Trophy } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { PwaInstallPanel } from './PwaInstallPanel';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { ThemePicker } from './ThemePicker';

type Tab = 'dashboard' | 'discovery' | 'rankings' | 'following' | 'tasks' | 'settings';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

const tabs = [
  { id: 'dashboard' as const, label: '首页', icon: Home },
  { id: 'discovery' as const, label: '发现', icon: Compass },
  { id: 'rankings' as const, label: '排行', icon: Trophy },
  { id: 'following' as const, label: '关注', icon: Heart },
  { id: 'tasks' as const, label: '任务', icon: Activity },
];

export function AppShell({ active, onChange, onLogout, onOpenSettings, children }: Props) {
  const online = useOnlineStatus();
  const keyboardVisible = useKeyboardVisible();

  return (
    <div className={`min-h-dvh bg-mist ${keyboardVisible ? 'pb-0' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]'}`}>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          <span className="text-sm font-medium text-ink">JAVDB 115</span>
          <div className="flex items-center gap-1">
            <button aria-label="打开设置" className={`flex h-11 w-11 items-center justify-center rounded-md ${active === 'settings' ? 'bg-teal-50 text-brand' : 'text-slate-500'}`} onClick={onOpenSettings} type="button"><Settings size={18} /></button>
            <button aria-label="退出登录" className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:text-danger" onClick={onLogout} type="button"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      {!online ? <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800" role="status">当前离线，115、任务和设置操作暂不可用。</p> : null}
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        {active === 'settings' ? <><PwaInstallPanel /><ThemePicker /></> : null}
        {children}
      </main>
      {!keyboardVisible ? (
        <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid h-16 max-w-3xl grid-cols-5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = active === tab.id;
              return (
                <button aria-current={selected ? 'page' : undefined} key={tab.id} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${selected ? 'text-brand' : 'text-slate-500'}`} onClick={() => onChange(tab.id)} type="button">
                  <Icon aria-hidden="true" size={20} /><span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
      <PwaUpdatePrompt />
    </div>
  );
}

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);
  return online;
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 120;
      setVisible(keyboardOpen);
      document.documentElement.dataset.keyboard = keyboardOpen ? 'open' : 'closed';
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      delete document.documentElement.dataset.keyboard;
    };
  }, []);

  return visible;
}
