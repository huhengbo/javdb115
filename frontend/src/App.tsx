import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { currentUser, logout as logoutRequest } from './api';
import { AppShell } from './components/AppShell';
import { MovieDetailNavigator } from './components/discovery/MovieDetailNavigator';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { FollowingPage } from './pages/FollowingPage';
import { LoginPage } from './pages/LoginPage';
import { RankingsPage } from './pages/RankingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';

type Tab = 'dashboard' | 'discovery' | 'rankings' | 'following' | 'tasks' | 'settings';
type AuthState = 'loading' | 'authenticated' | 'anonymous';

const TAB_PATHS: Record<Tab, string> = {
  dashboard: '/',
  discovery: '/discovery',
  rankings: '/rankings',
  following: '/following',
  tasks: '/tasks',
  settings: '/settings'
};

export default function App() {
  const initialTab = tabFromPath(window.location.pathname);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([initialTab]));
  const [settingsDirty, setSettingsDirty] = useState(false);
  const scrollPositions = useRef<Partial<Record<Tab, number>>>({ [initialTab]: window.scrollY });

  const logout = useCallback(() => {
    if (!window.confirm('确认退出当前登录？')) return;
    void logoutRequest().finally(() => setAuthState('anonymous'));
  }, []);

  const applyTab = useCallback((nextTab: Tab, pushHistory: boolean) => {
    if (tab === nextTab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      scrollPositions.current[nextTab] = 0;
      return true;
    }
    if (tab === 'settings' && settingsDirty && !window.confirm('设置尚未保存，确认离开并保留当前草稿吗？')) {
      return false;
    }
    scrollPositions.current[tab] = window.scrollY;
    setVisitedTabs((current) => new Set(current).add(nextTab));
    setTab(nextTab);
    if (pushHistory) {
      const nextPath = TAB_PATHS[nextTab];
      if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[nextTab] ?? 0 }));
    return true;
  }, [settingsDirty, tab]);

  const changeTab = useCallback((nextTab: Tab) => {
    applyTab(nextTab, true);
  }, [applyTab]);

  useEffect(() => {
    void currentUser()
      .then(() => setAuthState('authenticated'))
      .catch(() => setAuthState('anonymous'));
  }, []);

  useEffect(() => {
    const handler = () => setAuthState('anonymous');
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ dirty?: boolean }>).detail;
      setSettingsDirty(Boolean(detail?.dirty));
    };
    window.addEventListener('settings-dirty-change', handler);
    return () => window.removeEventListener('settings-dirty-change', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      const nextTab = tabFromPath(window.location.pathname);
      if (!applyTab(nextTab, false)) {
        window.history.pushState({}, '', TAB_PATHS[tab]);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [applyTab, tab]);

  if (authState === 'loading') {
    return <main className="flex min-h-dvh items-center justify-center bg-mist text-sm text-slate-600">正在检查登录状态...</main>;
  }

  if (authState === 'anonymous') {
    return <LoginPage onLoggedIn={() => setAuthState('authenticated')} />;
  }

  return (
    <MovieDetailNavigator scope="global-task-movies">
      <AppShell active={tab} onChange={changeTab} onLogout={logout} onOpenSettings={() => changeTab('settings')}>
        <TabPanel active={tab === 'dashboard'} mounted={visitedTabs.has('dashboard')}><DashboardPage onOpenSettings={() => changeTab('settings')} /></TabPanel>
        <TabPanel active={tab === 'discovery'} mounted={visitedTabs.has('discovery')}><DiscoveryPage /></TabPanel>
        <TabPanel active={tab === 'rankings'} mounted={visitedTabs.has('rankings')}><RankingsPage /></TabPanel>
        <TabPanel active={tab === 'following'} mounted={visitedTabs.has('following')}><FollowingPage /></TabPanel>
        <TabPanel active={tab === 'tasks'} mounted={visitedTabs.has('tasks')}><TasksPage /></TabPanel>
        <TabPanel active={tab === 'settings'} mounted={visitedTabs.has('settings')}><SettingsPage /></TabPanel>
      </AppShell>
    </MovieDetailNavigator>
  );
}

function TabPanel(props: { readonly active: boolean; readonly mounted: boolean; readonly children: ReactNode }) {
  if (!props.mounted) return null;
  return <div aria-hidden={!props.active} hidden={!props.active} inert={!props.active}>{props.children}</div>;
}

function tabFromPath(pathname: string): Tab {
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  if (firstSegment === 'discovery') return 'discovery';
  if (firstSegment === 'rankings') return 'rankings';
  if (firstSegment === 'following') return 'following';
  if (firstSegment === 'tasks') return 'tasks';
  if (firstSegment === 'settings') return 'settings';
  return 'dashboard';
}
