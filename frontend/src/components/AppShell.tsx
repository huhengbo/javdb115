import { Activity, Compass, Heart, Home, LogOut, Settings, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

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
  return (
    <div className="min-h-dvh bg-mist pb-20">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          <span className="text-sm font-medium text-ink">JAVDB 115</span>
          <div className="flex items-center gap-1">
            <button
              aria-label="打开设置"
              className={`flex h-10 w-10 items-center justify-center rounded-md ${
                active === 'settings' ? 'bg-teal-50 text-brand' : 'text-slate-500'
              }`}
              onClick={onOpenSettings}
              type="button"
            >
              <Settings size={18} />
            </button>
            <button
              aria-label="退出登录"
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:text-danger"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
                  selected ? 'text-brand' : 'text-slate-500'
                }`}
                onClick={() => onChange(tab.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
