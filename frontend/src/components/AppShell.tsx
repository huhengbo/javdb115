import { Activity, Compass, Heart, Home, LogOut, Settings, Trophy } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { JAVDB_AUTH_REQUIRED_EVENT } from '../api';
import { JavdbLoginPanel } from './JavdbLoginPanel';
import { PwaInstallPanel } from './PwaInstallPanel';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { QuickTools } from './QuickTools';
import { ThemePicker } from './ThemePicker';

type Tab = 'dashboard' | 'discovery' | 'rankings' | 'following' | 'tasks' | 'settings';

type Props = {
  active: Tab;
  javdbLoginRequestId: number;
  onChange: (tab: Tab) => void;
  onJavdbAuthChanged: (authenticated: boolean) => void;
  onLogout: () => void;
  onOpenJavdbLogin: () => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

type JavdbAuthNotice = { feature: string };

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

export function AppShell({ active, javdbLoginRequestId, onChange, onJavdbAuthChanged, onLogout, onOpenJavdbLogin, onOpenSettings, children }: Props) {
  const online = useOnlineStatus();
  const keyboardVisible = useKeyboardVisible();
  const [javdbNotice, setJavdbNotice] = useState<JavdbAuthNotice | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ feature?: string }>).detail;
      setJavdbNotice({ feature: detail?.feature?.trim() || '此功能' });
    };
    window.addEventListener(JAVDB_AUTH_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(JAVDB_AUTH_REQUIRED_EVENT, handler);
  }, []);

  function handleJavdbAuthChanged(authenticated: boolean) {
    if (authenticated) setJavdbNotice(null);
    onJavdbAuthChanged(authenticated);
  }

  return (
    <div className={`min-h-dvh bg-mist ${keyboardVisible ? 'pb-0' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]'}`}>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{pageTitles[active]}</h1>
          <div className="flex items-center gap-1">
            {active !== 'settings' ? (
              <button aria-label="打开设置" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" onClick={onOpenSettings} type="button"><Settings size={19} /></button>
            ) : (
              <button aria-label="退出登录" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-danger" onClick={onLogout} type="button"><LogOut size={19} /></button>
            )}
          </div>
        </div>
      </header>
      {!online ? <p className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800" role="status">当前离线，部分操作暂不可用。</p> : null}
      <main className="app-page mx-auto w-full max-w-3xl px-4 py-4 sm:py-5">
        {javdbNotice && active !== 'settings' ? (
          <div className="mb-3 flex min-h-12 items-center justify-between gap-3 border-y border-line py-2" role="status">
            <p className="text-sm text-slate-600">{javdbNotice.feature}需要登录 JavDB</p>
            <button className="min-h-11 shrink-0 px-2 text-sm font-medium text-brand" onClick={onOpenJavdbLogin} type="button">去登录</button>
          </div>
        ) : null}
        {active === 'settings' ? (
          <div className="mb-5 space-y-5">
            <JavdbLoginPanel focusRequestId={javdbLoginRequestId} onAuthChanged={handleJavdbAuthChanged} />
            <ThemePicker />
            <PwaInstallPanel />
          </div>
        ) : null}
        {children}
      </main>
      {!keyboardVisible ? (
        <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-[80] border-t border-line/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto grid h-16 max-w-3xl grid-cols-5 px-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = active === tab.id;
              return (
                <button aria-current={selected ? 'page' : undefined} key={tab.id} className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${selected ? 'text-brand' : 'text-slate-500'}`} onClick={() => onChange(tab.id)} type="button">
                  {selected ? <span className="absolute top-0 h-0.5 w-5 rounded-full bg-brand" /> : null}
                  <Icon aria-hidden="true" size={20} strokeWidth={selected ? 2.35 : 2} /><span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
      <QuickTools hidden={keyboardVisible} />
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
