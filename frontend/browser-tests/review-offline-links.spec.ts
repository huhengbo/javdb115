import { expect, test, type Route } from '@playwright/test';
import { URL } from 'node:url';

const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=sample';
const ed2k = 'ed2k://|file|sample.mkv|123456|0123456789ABCDEF0123456789ABCDEF|/';
const submitted: string[] = [];

const movie = {
  id: 'review-links',
  number: 'LINK-001',
  title: '评论离线链接测试',
  thumb_url: '',
  cover_url: '',
  duration: 120,
  release_date: '2026-09-01',
  score: '4.2',
  can_play: true,
  has_cnsub: false,
  has_preview_images: false,
  magnets_count: 0,
  preview_images: []
};

test.beforeEach(async ({ page }) => {
  submitted.length = 0;
  await page.route('**/api/**', async (route) => handleApi(route));
});

test('review magnet and ed2k links open confirmation and submit to quick offline download', async ({ page }) => {
  await page.goto('/discovery');
  await page.getByText('LINK-001', { exact: true }).click();

  const magnetButton = page.getByRole('button', { name: magnet, exact: true });
  await expect(magnetButton).toBeVisible();
  await magnetButton.click();
  await expect(page.getByRole('heading', { name: '确认离线下载' })).toBeVisible();
  await expect(page.getByText('确认将这条磁力链接加入 115 离线下载？')).toBeVisible();
  await page.getByRole('button', { name: '加入离线下载' }).click();
  await expect(page.getByRole('status')).toContainText('已加入 115 离线下载 · offline-1');
  expect(submitted).toEqual([magnet]);

  const ed2kButton = page.getByRole('button', { name: ed2k, exact: true });
  await expect(ed2kButton).toBeVisible();
  await ed2kButton.click();
  await expect(page.getByText('确认将这条ED2K链接加入 115 离线下载？')).toBeVisible();
  await page.getByRole('button', { name: '加入离线下载' }).click();
  await expect(page.getByRole('status')).toContainText('已加入 115 离线下载 · offline-2');
  expect(submitted).toEqual([magnet, ed2k]);
});

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') return json(route, { username: 'admin' });
  if (path === '/api/follows') return json(route, []);
  if (path === '/api/javdb/movies/latest') return json(route, [movie]);
  if (path === '/api/javdb/movies/review-links/bundle') {
    return json(route, {
      detail: {
        id: 'review-links',
        number: 'LINK-001',
        title: '评论离线链接测试',
        cover_url: '',
        duration: 120,
        score: '4.2',
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
      reviews: [
        {
          id: 1,
          username: '网友A',
          status_title: '看过',
          score: 5,
          content: `分享磁力：${magnet}\n备用 ED2K：${ed2k}\n普通文字不应变成按钮`,
          likes_count: 12,
          created_at: '2026-09-13T00:00:00Z'
        }
      ],
      reviews_error: null
    });
  }
  if (path === '/api/tasks/by-work/LINK-001') return json(route, []);
  if (path === '/api/tools/offline' && request.method() === 'POST') {
    const payload = JSON.parse(request.postData() ?? '{}') as { url?: string };
    submitted.push(payload.url ?? '');
    return json(route, { ok: true, task_id: `offline-${submitted.length}` });
  }
  return json(route, {});
}

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
