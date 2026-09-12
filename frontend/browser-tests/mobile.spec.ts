import { expect, test, type Page, type Route } from '@playwright/test';
import { URL } from 'node:url';

const latestMovie = movie('latest-1', 'ABC-001', '最新作品');
const staleSearchMovie = movie('stale-1', 'OLD-999', '旧搜索结果');

let savedSettings: Array<{ key: string; value: string; is_secret: boolean }> = [];

test.beforeEach(async ({ page }) => {
  savedSettings = [];
  await mockApi(page);
});

test('mobile search clears an in-flight result and keeps the latest list', async ({ page }) => {
  await page.goto('/discovery');
  await expect(page.getByText('ABC-001')).toBeVisible();

  const search = page.getByLabel('搜索番号或演员名');
  await search.fill('OLD');
  await page.getByRole('button', { name: '搜索作品' }).click();
  await page.getByRole('button', { name: '清空搜索' }).click();

  await expect(search).toHaveValue('');
  await page.waitForTimeout(350);
  await expect(page.getByText('OLD-999')).toHaveCount(0);
  await expect(page.getByText('ABC-001')).toBeVisible();
});

test('settings preserve multiline filter drafts and save normalized values', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();

  const keywords = page.getByLabel('必须包含关键词');
  await keywords.fill('中文字幕\n中文输入');
  await expect(keywords).toHaveValue('中文字幕\n中文输入');
  await keywords.blur();

  const minSize = page.getByLabel('最小体积（GB）');
  await minSize.fill('2.5');
  await minSize.blur();

  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存');

  const filterRules = savedSettings.find((item) => item.key === 'filter_rules');
  expect(filterRules).toBeTruthy();
  expect(JSON.parse(filterRules?.value ?? '{}')).toMatchObject({
    min_size_gb: 2.5,
    required_keywords: ['中文字幕', '中文输入']
  });
});

test('directory picker uses enter-then-confirm mobile flow', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /115 下载临时目录/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: /电影/ }).click();
  await expect(dialog).toContainText('根目录 / 电影');
  await page.getByRole('button', { name: '选择当前目录' }).click();
  await expect(page.getByRole('button', { name: /115 下载临时目录/ })).toContainText('根目录 / 电影');
});

test('theme selection persists and all supported widths avoid horizontal overflow', async ({ page }, testInfo) => {
  const themes = ['harbor', 'graphite', 'paper', 'blueprint'] as const;
  const widths = [320, 390, 430, 1440];

  await page.goto('/settings');
  for (const theme of themes) {
    await page.getByRole('button', { name: '选择外观主题' }).click();
    await page.getByRole('button', { name: themeLabel(theme), exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`), fullPage: true });
      }
    }
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');
});

test('reduced motion and PWA manifest contracts are active in the real browser build', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/settings');
  const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(scrollBehavior).toBe('auto');

  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.some((icon: { sizes?: string; purpose?: string }) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBeTruthy();
});

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => handleApi(route));
}

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') return json(route, { username: 'admin' });
  if (path === '/api/follows') return json(route, []);
  if (path === '/api/javdb/movies/latest') return json(route, [latestMovie]);
  if (path === '/api/javdb/search') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return json(route, [staleSearchMovie]);
  }
  if (path === '/api/settings' && request.method() === 'GET') return json(route, settingsFixture());
  if (path === '/api/settings' && request.method() === 'PUT') {
    savedSettings = JSON.parse(request.postData() ?? '{}').items ?? [];
    return json(route, { ok: true });
  }
  if (path === '/api/settings/115/login/devices') {
    return json(route, [{ value: 'alipaymini', label: '支付宝小程序', recommended: true }]);
  }
  if (path === '/api/settings/115/directories') {
    const parent = url.searchParams.get('parent_id');
    return json(route, parent === '0'
      ? [{ id: 'movies', name: '电影', path: '/电影', is_directory: true }]
      : [{ id: 'child', name: '归档', path: '/电影/归档', is_directory: true }]);
  }
  return json(route, {});
}

function settingsFixture() {
  const values: Record<string, string> = {
    p115_cookie: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    check_cron: '0 */6 * * *',
    filter_rules: JSON.stringify({ min_size_gb: 1, required_keywords: [], excluded_keywords: [] }),
    p115_completed_dir_mode: 'single',
    p115_download_dir_id: '',
    p115_download_dir_label: '',
    p115_completed_dir_id: '',
    p115_completed_dir_label: '',
    p115_completed_censored_dir_id: '',
    p115_completed_censored_dir_label: '',
    p115_completed_uncensored_dir_id: '',
    p115_completed_uncensored_dir_label: '',
    p115_completed_fc2_dir_id: '',
    p115_completed_fc2_dir_label: ''
  };
  return Object.entries(values).map(([key, value]) => ({ key, value, is_secret: key === 'p115_cookie' || key === 'telegram_bot_token' }));
}

function movie(id: string, number: string, title: string) {
  return {
    id,
    number,
    title,
    thumb_url: '',
    cover_url: '',
    duration: 120,
    release_date: '2026-09-01',
    score: '4.2',
    can_play: true,
    has_cnsub: false,
    has_preview_images: false,
    magnets_count: 1,
    preview_images: []
  };
}

function themeLabel(theme: 'harbor' | 'graphite' | 'paper' | 'blueprint') {
  return { harbor: '海盐青', graphite: '石墨夜', paper: '暖纸', blueprint: '高对比蓝图' }[theme];
}

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
