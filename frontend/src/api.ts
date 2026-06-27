import type {
  ActorDetail,
  Dashboard,
  DirectoryItem,
  Follow,
  FollowCheckResult,
  ManualOfflineResult,
  MagnetItem,
  Movie,
  MovieBundle,
  MovieDetail,
  MovieReview,
  P115LoginDevice,
  P115QrStart,
  P115QrStatus,
  RankingActor,
  SettingItem,
  Task,
  TaskHistoryItem,
  TelegramTestResult
} from './types';

const TOKEN_KEY = 'javdb115.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(path, { cache: 'no-store', ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth-expired'));
    }
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  }
  if (payload === null) {
    throw new Error(`Invalid JSON response: ${path}`);
  }
  return payload as T;
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export const client = {
  dashboard: () => api<Dashboard>('/api/dashboard'),
  runCheck: () => api<{ ok: boolean }>('/api/checks/run', { method: 'POST' }),
  tasks: () => api<Task[]>('/api/tasks'),
  retryTask: (id: number) => api<{ ok: boolean }>(`/api/tasks/${id}/retry`, { method: 'POST' }),
  deleteTask: (id: number) => api<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  taskHistory: (code: string) => api<TaskHistoryItem[]>(`/api/tasks/by-work/${encodeURIComponent(code)}`),
  settings: () => api<SettingItem[]>('/api/settings'),
  saveSettings: (items: SettingItem[]) => api<{ ok: boolean }>('/api/settings', { method: 'PUT', body: JSON.stringify({ items }) }),
  testTelegram: (message?: string) =>
    api<TelegramTestResult>('/api/settings/telegram/test', {
      method: 'POST',
      body: JSON.stringify({ message })
    }),
  directories: (parentId: string) => api<DirectoryItem[]>(`/api/settings/115/directories?parent_id=${encodeURIComponent(parentId)}`),
  p115LoginDevices: () => api<P115LoginDevice[]>('/api/settings/115/login/devices'),
  startP115QrLogin: (device: string) =>
    api<P115QrStart>('/api/settings/115/login/qrcode', {
      method: 'POST',
      body: JSON.stringify({ device })
    }),
  p115QrLoginStatus: (sessionId: string) =>
    api<P115QrStatus>(`/api/settings/115/login/qrcode/${encodeURIComponent(sessionId)}`),
  cancelP115QrLogin: (sessionId: string) =>
    api<{ ok: boolean }>(`/api/settings/115/login/qrcode/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' }),

  // Follows API
  follows: () => api<Follow[]>('/api/follows'),
  createFollow: (payload: {
    actor_external_id: string;
    actor_name: string;
    actor_profile_url: string;
    actor_avatar_url?: string;
    selected_tag_ids: string[];
    selected_tag_names: string[];
    type?: string;
  }) =>
    api<Follow>('/api/follows', { method: 'POST', body: JSON.stringify(payload) }),
  updateFollow: (
    id: number,
    payload: { enabled?: boolean; selected_tag_ids?: string[]; selected_tag_names?: string[] }
  ) =>
    api<Follow>(`/api/follows/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFollow: (id: number) =>
    api<{ ok: boolean }>(`/api/follows/${id}`, { method: 'DELETE' }),
  checkFollow: (id: number) =>
    api<FollowCheckResult>(`/api/follows/${id}/check`, { method: 'POST' }),
  checkAllFollows: () =>
    api<FollowCheckResult[]>('/api/follows/check', { method: 'POST' }),

  // JavDB API proxy (public endpoints)
  movieBundle: (id: string) => api<MovieBundle>(`/api/javdb/movies/${id}/bundle`),
  movieDetail: (id: string) => api<MovieDetail>(`/api/javdb/movies/${id}`),
  movieMagnets: (id: string) => api<MagnetItem[]>(`/api/javdb/movies/${id}/magnets`),
  movieReviews: (id: string, limit = 5) =>
    api<MovieReview[]>(`/api/javdb/movies/${id}/reviews?limit=${encodeURIComponent(String(limit))}`),
  moviesLatest: (filterBy?: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (filterBy) params.set('filter_by', filterBy);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    return api<Movie[]>(`/api/javdb/movies/latest?${params.toString()}`);
  },
  moviesByTag: (filterBy: string) => api<Movie[]>(`/api/javdb/movies/tags?filter_by=${encodeURIComponent(filterBy)}`),
  moviesRecommend: (period?: string) => api<Movie[]>(`/api/javdb/movies/recommend?period=${period ?? 'daily'}`),
  rankings: (type = '0', period = 'today') =>
    api<Movie[]>(`/api/javdb/rankings?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`),
  rankingsPlayback: (period = 'daily', filterBy = 'high_score') =>
    api<Movie[]>(`/api/javdb/rankings/playback?period=${encodeURIComponent(period)}&filter_by=${encodeURIComponent(filterBy)}`),
  rankingsActors: (type = 'monthly') =>
    api<RankingActor[]>(`/api/javdb/rankings/actors?type=${encodeURIComponent(type)}`),
  actorDetail: (id: string) => api<ActorDetail>(`/api/javdb/actors/${id}`),
  actorMovies: (id: string, tagIds: string[], sortType: number, page = 1, limit = 24) => {
    const params = new URLSearchParams();
    params.set('sort_type', String(sortType));
    params.set('page', String(page));
    params.set('limit', String(limit));
    tagIds.forEach((tagId) => params.append('tag_ids', tagId));
    return api<Movie[]>(`/api/javdb/actors/${id}/movies?${params.toString()}`);
  },
  submitMovieOffline: (movieId: string, magnetHash: string, force = false) =>
    api<ManualOfflineResult>(`/api/javdb/movies/${movieId}/offline`, {
      method: 'POST',
      body: JSON.stringify({ magnet_hash: magnetHash, force })
    }),
  search: (q: string) => api<Movie[]>(`/api/javdb/search?q=${encodeURIComponent(q)}`),
};
