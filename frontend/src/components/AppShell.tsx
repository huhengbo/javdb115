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

const pageTitles: Record<Tab, string> = {
  dashboard: '运行中心',
  discovery: '发现',
  rankings: '排行',
  following: '关注',
  tasks: '任务',
  settings: '设置'
};

export function AppShell({ active, onChange, onLogout, onOpenSettings, children }: Props) {
  const online = useOnlineStatus();
  const keyboardVisible = useKeyboardVisible();
  const usesLegacyPageHeading = active === 'rankings' || active === 'settings';

  return (
    <div className={`min-h-dvh bg-mist ${keyboardVisible ? 'pb-0' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">JAVDB 115</p>
            {usesLegacyPageHeading ? <p className="truncate text-xs text-slate-500">{active === 'settings' ? '配置与偏好' : '榜单浏览'}</p> : <h1 className="truncate text-base font-semibold leading-5 text-ink">{pageTitles[active]}</h1>}
          </div>
          <div className="flex items-center gap-1">
            <button aria-label="打开设置" className={`flex h-11 w-11 items-center justify-center rounded-full ${active === 'settings' ? 'bg-teal-50 text-brand' : 'text-slate-500 hover:bg-slate-100'}`} onClick={onOpenSettings} type="button"><Settings size={19} /></button>
            {active === 'settings' ? <button aria-label="退出登录" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-danger" onClick={onLogout} type="button"><LogOut size={19} /></button> : null}
          </div>
        </div>
      </header>
      {!online ? <p className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800" role="status">当前离线，115、任务和设置操作暂不可用。</p> : null}
      <main className="app-page mx-auto w-full max-w-3xl px-4 py-4 sm:py-5">
        {active === 'settings' ? <div className="mb-5 space-y-4"><PwaInstallPanel /><ThemePicker /></div> : null}
        {children}
      </main>
      {!keyboardVisible ? (
        <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto grid h-[4.5rem] max-w-3xl grid-cols-5 gap-1 px-2 py-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = active === tab.id;
              return (
                <button aria-current={selected ? 'page' : undefined} key={tab.id} className={`group flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium ${selected ? 'bg-teal-50 text-brand' : 'text-slate-500 hover:bg-slate-100'}`} onClick={() => onChange(tab.id)} type="button">
                  <Icon aria-hidden="true" size={20} strokeWidth={selected ? 2.4 : 2} /><span>{tab.label}</span>
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
