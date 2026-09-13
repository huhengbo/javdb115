import { expect, test, type Route } from '@playwright/test';
import { URL } from 'node:url';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => handleApi(route));
});

test('ranking filter sheet stays above the global tabbar and its bottom action remains clickable', async ({ page }) => {
  await page.goto('/rankings');
  await page.getByRole('button', { name: '筛选' }).click();

  const dialog = page.getByRole('dialog', { name: '排行筛选' });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(dialog).toBeVisible();
  await expect(navigation).toBeVisible();

  const sheetLayer = await dialog.locator('..').evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  const navigationLayer = await navigation.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  expect(sheetLayer).toBeGreaterThan(navigationLayer);

  await page.getByRole('button', { name: '完成' }).click();
  await expect(dialog).toHaveCount(0);
});

test('task filter sheet also stays above the global tabbar', async ({ page }) => {
  await page.goto('/tasks');
  await page.getByRole('button', { name: /更多/ }).click();

  const dialog = page.getByRole('dialog', { name: '更多任务筛选' });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(dialog).toBeVisible();

  const sheetLayer = await dialog.locator('..').evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  const navigationLayer = await navigation.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  expect(sheetLayer).toBeGreaterThan(navigationLayer);
});

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') return json(route, { username: 'admin' });
  if (path === '/api/follows') return json(route, []);
  if (path === '/api/javdb/rankings') return json(route, []);
  if (path === '/api/tasks') {
    return json(route, {
      items: [],
      has_more: false,
      next_cursor: null,
      total: 0,
      counts: {
        all: 0,
        attention: 0,
        submitted: 0,
        downloading: 0,
        organizing: 0,
        completed: 0,
        submit_failed: 0,
        download_failed: 0,
        organize_failed: 0,
        incomplete_submit: 0
      }
    });
  }
  return json(route, {});
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
