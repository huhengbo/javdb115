import { Activity, Compass, Heart, Home, LogOut, Settings, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

type Tab = 'dashboard' | 'discovery' | 'rankings' | 'following' | 'tasks' | 'settings';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
  onLogout: () => void;
  children: ReactNode;
};

const tabs = [
  { id: 'dashboard' as const, label: '首页', icon: Home },
  { id: 'discovery' as const, label: '发现', icon: Compass },
  { id: 'rankings' as const, label: '排行', icon: Trophy },
  { id: 'following' as const, label: '关注', icon: Heart },
  { id: 'tasks' as const, label: '任务', icon: Activity },
  { id: 'settings' as const, label: '设置', icon: Settings },
];

export function AppShell({ active, onChange, onLogout, children }: Props) {
  return (
    <div className="min-h-dvh bg-mist pb-20">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          <span className="text-sm font-medium text-ink">JAVDB 115</span>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:text-danger"
            onClick={onLogout}
            type="button"
          >
            <LogOut size={14} />
            <span>退出</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-6">
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
