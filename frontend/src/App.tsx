import { useCallback, useEffect, useState } from 'react';
import { clearToken, getToken } from './api';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { FollowingPage } from './pages/FollowingPage';
import { LoginPage } from './pages/LoginPage';
import { RankingsPage } from './pages/RankingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';

type Tab = 'dashboard' | 'discovery' | 'rankings' | 'following' | 'tasks' | 'settings';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(getToken()));
  const [tab, setTab] = useState<Tab>('dashboard');

  const logout = useCallback(() => {
    clearToken();
    setLoggedIn(false);
  }, []);

  useEffect(() => {
    setLoggedIn(Boolean(getToken()));
  }, []);

  useEffect(() => {
    const handler = () => setLoggedIn(false);
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  if (!loggedIn) {
    return <LoginPage onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <AppShell active={tab} onChange={setTab} onLogout={logout}>
      {tab === 'dashboard' ? <DashboardPage onOpenSettings={() => setTab('settings')} /> : null}
      {tab === 'discovery' ? <DiscoveryPage /> : null}
      {tab === 'rankings' ? <RankingsPage /> : null}
      {tab === 'following' ? <FollowingPage /> : null}
      {tab === 'tasks' ? <TasksPage /> : null}
      {tab === 'settings' ? <SettingsPage /> : null}
    </AppShell>
  );
}
