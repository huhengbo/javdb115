import { expect, test, type Page, type Route } from '@playwright/test';
import { URL } from 'node:url';

const follow = {
  id: 1, actor_external_id: 'actor-1', actor_name: '测试演员',
  actor_profile_url: '', actor_avatar_url: '', selected_tag_ids: [],
  selected_tag_names: [], type: 'actor', enabled: true, latest_count: 0,
  updated_at: '2026-09-21T10:00:00Z'
};

function movies(page: number, count = 24, sort = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${sort}-p${page}-${index}`, number: `S${sort}-P${page}-${index}`,
    title: '测试作品', thumb_url: '', release_date: '2026-09-01'
  }));
}

async function setup(page: Page, handleMovies: (route: Route, url: URL) => Promise<void>) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return json(route, { username: 'admin' });
    if (url.pathname === '/api/follows') return json(route, [follow]);
    if (url.pathname === '/api/javdb/actors/actor-1') return json(route, { name: '测试演员', videos_count: 49 });
    if (url.pathname.endsWith('/actors/actor-1/movies')) return handleMovies(route, url);
    if (url.pathname.endsWith('/bundle')) return json(route, {
      detail: { id: 's0-p1-0', number: 'S0-P1-0', title: '测试作品', cover_url: '',
        actors: [], tags: [], preview_images: [], relative_movies: [], actor_movies: [] },
      magnets: [], reviews: [], reviews_error: null
    });
    return json(route, []);
  });
  await page.goto('/following');
  await page.getByText('测试演员', { exact: true }).click();
  await expect(page.getByText('演员详情 · 测试演员')).toBeVisible();
}

test('actor sheet automatically appends consecutive pages and stops at the last page', async ({ page }) => {
  const requested: number[] = [];
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    requested.push(current);
    await json(route, movies(current, current === 3 ? 1 : 24));
  });
  await expect(page.getByText('S0-P1-0', { exact: true })).toBeVisible();
  await page.getByText('S0-P1-23', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('S0-P2-23', { exact: true })).toHaveCount(1);
  await page.getByText('S0-P2-23', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('S0-P3-0', { exact: true })).toHaveCount(1);
  await page.getByText('S0-P3-0', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('已加载全部', { exact: true })).toBeVisible();
  expect(requested.filter((value) => value === 2)).toHaveLength(1);
  expect(requested.filter((value) => value === 3)).toHaveLength(1);
  await expect(page.getByText('按 App 接口返回顺序刷新作品列表')).toHaveCount(0);
  await expect(page.getByText('标签会直接参与演员作品搜索')).toHaveCount(0);
  await expect(page.getByText('暂无更多资料')).toHaveCount(0);
});

test('failed next page pauses automatic loading and retries the same page without duplicates', async ({ page }) => {
  let attempts = 0;
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    if (current === 2 && ++attempts === 1) return json(route, { error: { message: '测试加载失败' } }, 503);
    await json(route, movies(current, current === 2 ? 2 : 24));
  });
  await page.getByText('S0-P1-23', { exact: true }).scrollIntoViewIfNeeded();
  const retry = page.getByRole('button', { name: '重试加载第 2 页' });
  await expect(retry).toBeVisible();
  await page.waitForTimeout(400);
  expect(attempts).toBe(1);
  await retry.click();
  await expect(page.getByText('S0-P2-0', { exact: true })).toHaveCount(1);
  await expect(page.getByText('S0-P1-0', { exact: true })).toHaveCount(1);
  expect(attempts).toBe(2);
});

test('first-page failures retry page one rather than skipping to page two', async ({ page }) => {
  let fail = true;
  const requested: number[] = [];
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    requested.push(current);
    if (fail) return json(route, { error: { message: '首屏失败' } }, 503);
    await json(route, movies(current, 1));
  });
  await expect(page.getByRole('alert')).toContainText('首屏失败');
  fail = false;
  await page.getByRole('button', { name: '重试加载第 1 页' }).click();
  await expect(page.getByText('S0-P1-0', { exact: true })).toBeVisible();
  expect(requested.every((value) => value === 1)).toBe(true);
});

test('a hidden actor sheet pauses pagination until returning from movie detail', async ({ page }) => {
  let secondPages = 0;
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    if (current === 2) secondPages++;
    await json(route, movies(current, current === 2 ? 1 : 24));
  });
  await page.getByText('S0-P1-0', { exact: true }).click();
  await expect(page.getByText('作品详情 · S0-P1-0')).toBeVisible();
  const actorSheet = page.locator('.fixed.inset-0.overflow-y-auto').filter({ hasText: '演员详情 · 测试演员' });
  await actorSheet.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(400);
  expect(secondPages).toBe(0);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByText('S0-P2-0', { exact: true })).toHaveCount(1);
});

test('a repeated full page is deduplicated and does not create an automatic request loop', async ({ page }) => {
  const requested: number[] = [];
  await setup(page, async (route, url) => {
    requested.push(Number(url.searchParams.get('page')));
    await json(route, movies(1));
  });
  await page.getByText('S0-P1-23', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('已加载全部', { exact: true })).toBeVisible();
  await expect(page.getByText('S0-P1-0', { exact: true })).toHaveCount(1);
  expect(requested.filter((value) => value > 1)).toEqual([2]);
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('changing sort discards an older in-flight page and starts again at page one', async ({ page }) => {
  let releaseOld: (() => void) | undefined;
  const requested: { page: number; sort: number }[] = [];
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    const sort = Number(url.searchParams.get('sort_type'));
    requested.push({ page: current, sort });
    if (current === 2 && sort === 0) await new Promise<void>((resolve) => { releaseOld = resolve; });
    await json(route, movies(current, sort === 1 ? 1 : 24, sort));
  });
  await page.getByText('S0-P1-23', { exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => !!releaseOld).toBe(true);
  await page.getByRole('button', { name: '评分倒序', exact: true }).click();
  await expect(page.getByText('S1-P1-0', { exact: true })).toBeVisible();
  releaseOld?.();
  await page.waitForTimeout(250);
  await expect(page.getByText('S0-P2-0', { exact: true })).toHaveCount(0);
  expect(requested.filter((request) => request.sort === 1)).toEqual([{ page: 1, sort: 1 }]);
});

test('changing tags resets the list and retains the filter on the request', async ({ page }) => {
  const taggedPages: number[] = [];
  await setup(page, async (route, url) => {
    const current = Number(url.searchParams.get('page'));
    const tagged = url.searchParams.getAll('tag_ids').includes('c');
    if (tagged) taggedPages.push(current);
    await json(route, tagged ? [{ ...movies(1, 1)[0], id: 'tagged', number: 'TAGGED-1' }] : movies(current, current === 2 ? 1 : 24));
  });
  await page.getByText('S0-P1-23', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('S0-P2-0', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '含字幕', exact: true }).click();
  await expect(page.getByText('TAGGED-1', { exact: true })).toBeVisible();
  await expect(page.getByText('S0-P1-0', { exact: true })).toHaveCount(0);
  await expect(page.getByText('S0-P2-0', { exact: true })).toHaveCount(0);
  expect(taggedPages).toEqual([1]);
});
