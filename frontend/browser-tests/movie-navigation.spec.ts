import { expect, test, type Route } from '@playwright/test';
import { URL } from 'node:url';

const task = {
  id: 42,
  status: 'completed',
  stage: '115_organized',
  error_message: null,
  cloud_task_id: 'cloud-42',
  cloud_file_id: 'file-42',
  cloud_file_name: 'ABC-123',
  created_at: '2026-09-12T10:00:00Z',
  updated_at: '2026-09-12T10:05:00Z',
  work: {
    id: 7,
    code: 'ABC-123',
    title: '任务作品',
    cover_url: '',
    release_date: '2026-09-01',
    source_url: 'https://javdb.com/v/task-movie-1',
    actors: [],
    status: 'completed'
  },
  actor: null,
  magnet: null
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => handleApi(route));
});

test('task cover and code open movie detail while global navigation and quick tools remain visible', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page.getByText('ABC-123', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'ABC-123', exact: true }).click();
  await expect(page.getByText('作品详情 · ABC-123')).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '主导航' });
  const quickTools = page.getByRole('button', { name: '快捷工具' });
  await expect(navigation).toBeVisible();
  await expect(navigation).toHaveCSS('z-index', '80');
  await expect(quickTools).toBeVisible();
  await expect(quickTools).toHaveCSS('z-index', '85');

  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByText('作品详情 · ABC-123')).toHaveCount(0);

  await page.getByRole('button', { name: '查看作品 ABC-123' }).click();
  await expect(page.getByText('作品详情 · ABC-123')).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(quickTools).toBeVisible();
});

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') return json(route, { username: 'admin' });
  if (path === '/api/follows') return json(route, []);
  if (path === '/api/tasks') {
    return json(route, {
      items: [task],
      has_more: false,
      next_cursor: null,
      total: 1,
      counts: {
        all: 1,
        attention: 0,
        submitted: 0,
        downloading: 0,
        organizing: 0,
        completed: 1,
        submit_failed: 0,
        download_failed: 0,
        organize_failed: 0,
        incomplete_submit: 0
      }
    });
  }
  if (path === '/api/javdb/movies/task-movie-1/bundle') {
    return json(route, {
      detail: {
        id: 'task-movie-1',
        number: 'ABC-123',
        title: '任务作品',
        cover_url: '',
        duration: 120,
        score: '4.5',
        release_date: '2026-09-01',
        has_cnsub: false,
        has_preview_images: false,
        actors: [],
        tags: [],
        preview_images: [],
        relative_movies: [],
        actor_movies: []
      },
      magnets: [],
      reviews: [],
      reviews_error: null
    });
  }
  if (path === '/api/tasks/by-work/ABC-123') return json(route, []);
  return json(route, {});
}

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
