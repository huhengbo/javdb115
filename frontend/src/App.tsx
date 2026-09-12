import { useCallback, useEffect, useState } from 'react';
import { currentUser, logout as logoutRequest } from './api';
import { AppShell } from './components/AppShell';
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
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));

  const logout = useCallback(() => {
    void logoutRequest().finally(() => setAuthState('anonymous'));
  }, []);

  const changeTab = useCallback((nextTab: Tab) => {
    const nextPath = TAB_PATHS[nextTab];
    setTab(nextTab);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, []);

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
    const handler = () => setTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  if (authState === 'loading') {
    return <main className="flex min-h-dvh items-center justify-center bg-mist text-sm text-slate-600">正在检查登录状态...</main>;
  }

  if (authState === 'anonymous') {
    return <LoginPage onLoggedIn={() => setAuthState('authenticated')} />;
  }

  return (
    <AppShell active={tab} onChange={changeTab} onLogout={logout} onOpenSettings={() => changeTab('settings')}>
      {tab === 'dashboard' ? <DashboardPage onOpenSettings={() => changeTab('settings')} /> : null}
      {tab === 'discovery' ? <DiscoveryPage /> : null}
      {tab === 'rankings' ? <RankingsPage /> : null}
      {tab === 'following' ? <FollowingPage /> : null}
      {tab === 'tasks' ? <TasksPage /> : null}
      {tab === 'settings' ? <SettingsPage /> : null}
    </AppShell>
  );
}

function tabFromPath(pathname: string): Tab {
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  if (firstSegment === 'discovery') {
    return 'discovery';
  }
  if (firstSegment === 'rankings') {
    return 'rankings';
  }
  if (firstSegment === 'following') {
    return 'following';
  }
  if (firstSegment === 'tasks') {
    return 'tasks';
  }
  if (firstSegment === 'settings') {
    return 'settings';
  }
  return 'dashboard';
}
