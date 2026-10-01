import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const latestMovie = movie('latest-1', 'ABC-001', '最新作品');
const staleSearchMovie = movie('stale-1', 'OLD-999', '旧搜索结果');
const topMovie = movie('top-1', 'TOP-001', 'TOP250 作品');

let savedSettings: Array<{ key: string; value: string; is_secret: boolean }> = [];
let javdbLoggedIn = false;
let quickOfflineSubmissions: string[] = [];
let p115Cookie = '';

test.beforeEach(async ({ page }) => {
  savedSettings = [];
  javdbLoggedIn = false;
  quickOfflineSubmissions = [];
  p115Cookie = 'UID=old_R2_1;CID=old;';
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

test('quick tools submit a direct 115 offline address from any page', async ({ page }) => {
  await page.goto('/discovery');
  const trigger = page.getByRole('button', { name: '快捷工具' });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: '快捷工具' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: /115 离线下载/ }).click();
  await page.getByLabel('磁力链接或离线地址').fill('https://example.com/video');
  await page.getByRole('button', { name: '提交到 115' }).click();

  await expect(page.getByRole('status')).toContainText('已提交到 115');
  expect(quickOfflineSubmissions).toEqual(['https://example.com/video']);
});

test('settings preserve multiline filter drafts and save normalized values', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await page.getByRole('button', { name: /高级过滤规则/ }).click();

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

test('settings echo the 115 cookie and refresh it after QR login', async ({ page }) => {
  await page.goto('/settings');
  const cookie = page.getByLabel('115 Cookie');
  await expect(cookie).toHaveValue('UID=old_R2_1;CID=old;');

  await page.getByRole('button', { name: '生成二维码' }).click();
  await page.getByRole('button', { name: '刷新状态' }).click();

  await expect(page.getByText('Cookie 已写入')).toBeVisible();
  // 扫码写入的新 Cookie 同步到表单且不算未保存修改，之后保存也不会用旧值覆盖
  await expect(cookie).toHaveValue('UID=new_R2_2;CID=new;');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
});

test('directory picker uses enter-then-confirm mobile flow', async ({ page }) => {
  await page.goto('/settings');
  const downloadDirectory = page.getByRole('button', { name: /^115 下载临时目录/ });
  await downloadDirectory.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: /电影/ }).click();
  await expect(dialog).toContainText('根目录 / 电影');
  await page.getByRole('button', { name: '选择当前目录' }).click();
  await expect(downloadDirectory).toContainText('根目录 / 电影');
});

test('TOP250 guides JavDB login in settings and returns to the protected view', async ({ page }) => {
  await page.goto('/rankings');
  await page.getByRole('button', { name: 'TOP250' }).click();

  await expect(page.getByText('TOP250需要登录 JavDB')).toBeVisible();
  await page.getByRole('button', { name: '去登录' }).click();

  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'JavDB 账号' })).toBeVisible();
  await page.getByLabel('用户名').fill('javdb-user');
  await page.getByLabel('密码').fill('secret');
  await page.getByRole('button', { name: '登录 JavDB' }).click();

  await expect(page.getByRole('heading', { name: '排行' })).toBeVisible();
  await expect(page.getByText('TOP-001')).toBeVisible();
  await expect(page).toHaveURL(/\/rankings\?.*board=top250/);
});

test('appearance modes persist, follow system, and avoid horizontal overflow', async ({ page }, testInfo) => {
  const modes = [
    { label: '白天', preference: 'light', resolved: 'harbor' },
    { label: '夜间', preference: 'dark', resolved: 'graphite' }
  ] as const;
  const widths = [320, 390, 430, 1440];

  await page.goto('/settings');
  await expect(page.getByLabel('115 Cookie')).toBeEnabled();
  for (const mode of modes) {
    const modeButton = page.getByRole('button', { name: new RegExp(mode.label) });
    await modeButton.click();
    await expect(modeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', mode.preference);
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode.resolved);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${mode.preference}-${width}.png`), fullPage: true });
    }
  }

  await page.emulateMedia({ colorScheme: 'dark' });
  const autoButton = page.getByRole('button', { name: /自动/ });
  await autoButton.click();
  await expect(autoButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'harbor');
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

test('online playback polls through transient errors and plays in the page player', async ({ page }) => {
  // Playwright 自带的 Chromium 不含 H.264 解码器，这里用 WebM 样片验证播放器交互
  const video = readFileSync(new URL('./fixtures/sample.webm', import.meta.url));
  let polls = 0;
  const playbackRequests: string[] = [];
  await page.route('**/api/javdb/movies/latest-1/bundle', (route) => json(route, {
    detail: { ...latestMovie, actors: [], tags: [], relative_movies: [], actor_movies: [] },
    magnets: [{ name: 'ABC-001.webm', hash: 'a'.repeat(40), size: 1.2, cnsub: false, hd: true, created_at: '2026-09-01' }],
    reviews: [],
    reviews_error: null
  }));
  await page.route('**/api/tasks/by-work/**', (route) => json(route, []));
  await page.route('**/api/tools/playback**', async (route) => {
    playbackRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    if (route.request().method() === 'POST') return json(route, playbackSession('offline_waiting'));
    polls += 1;
    if (polls === 1) return json(route, { error: { code: 'integration_error', message: '115 暂时不可用' } }, 502);
    return json(route, playbackSession('ready'));
  });
  await page.route('**/api/playback/stream/**', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes' },
    body: video
  }));

  await page.goto('/discovery');
  await page.getByText('ABC-001').click();
  await page.getByRole('button', { name: '在线播放' }).click();
  const dialog = page.getByRole('dialog', { name: '在线播放' });
  await expect(dialog.getByText('正在准备在线播放')).toBeVisible();
  await expect(dialog.getByText('播放已准备好')).toBeVisible({ timeout: 15_000 });
  expect(polls).toBe(2);
  expect(playbackRequests[0]).toBe('POST /api/tools/playback');

  await dialog.getByRole('button', { name: '立即播放' }).click();
  const player = page.getByRole('dialog', { name: '播放 ABC-001.webm' });
  await expect(player).toBeVisible();
  const element = player.locator('video');
  await expect.poll(() => element.evaluate((node: HTMLVideoElement) => node.duration)).toBeGreaterThan(20);
  await element.evaluate((node: HTMLVideoElement) => node.pause());

  await player.getByRole('button', { name: '快进 10 秒' }).click();
  await expect.poll(() => element.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThanOrEqual(10);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => element.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeLessThan(10);

  // 横向滑动画面拖动进度：30 秒样片滑过半个画面约快进 15 秒，松手才跳转且不触发暂停/播放
  const box = (await player.boundingBox())!;
  const startTime = await element.evaluate((node: HTMLVideoElement) => node.currentTime);
  const middleY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, middleY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, middleY, { steps: 8 });
  await expect(player.getByRole('status')).toContainText(/快进 0:1[45]/);
  expect(await element.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(startTime);
  await page.mouse.up();
  await expect(player.getByRole('status')).toHaveCount(0);
  const swiped = await element.evaluate((node: HTMLVideoElement) => node.currentTime);
  expect(swiped - startTime).toBeGreaterThan(13);
  expect(swiped - startTime).toBeLessThan(17);
  expect(await element.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.up();
  expect(await element.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(swiped);
  await element.evaluate((node: HTMLVideoElement) => node.pause());

  // 长按：暂停时无反应；播放中临时 2 倍速，松手恢复所选倍速且继续播放
  const center = { x: box.x + box.width / 2, y: middleY };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  expect(await element.evaluate((node: HTMLVideoElement) => [node.paused, node.playbackRate])).toEqual([true, 1]);
  await element.evaluate((node: HTMLVideoElement) => node.play());
  await page.mouse.down();
  await expect(player.getByRole('status')).toContainText('2x 倍速播放中');
  expect(await element.evaluate((node: HTMLVideoElement) => node.playbackRate)).toBe(2);
  await expect(player.getByLabel('播放倍速')).toHaveValue('1');
  await page.mouse.up();
  await expect(player.getByRole('status')).toHaveCount(0);
  expect(await element.evaluate((node: HTMLVideoElement) => [node.paused, node.playbackRate])).toEqual([false, 1]);
  await element.evaluate((node: HTMLVideoElement) => node.pause());

  await player.getByLabel('播放倍速').selectOption('2');
  expect(await element.evaluate((node: HTMLVideoElement) => node.playbackRate)).toBe(2);
  await player.getByRole('button', { name: '全屏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await player.getByRole('button', { name: '退出全屏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

  await player.getByRole('button', { name: '关闭播放' }).click();
  await expect(player).toHaveCount(0);
  await expect(dialog.getByText('播放已准备好')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('javdb115.playback.speed'))).toBe('2');
});

function playbackSession(status: 'offline_waiting' | 'ready') {
  const file = { id: 'file-1', name: 'ABC-001.webm', size: 75_896 };
  return {
    session_id: 'session-1',
    task_id: 'a'.repeat(40),
    status,
    message: status === 'ready' ? '播放地址已准备完成' : '115 离线中 · 30%',
    progress_percent: status === 'ready' ? 100 : 30,
    expires_at: '2026-10-01T00:00:00+00:00',
    files: status === 'ready' ? [file] : [],
    file: status === 'ready' ? file : null,
    play_url: status === 'ready' ? '/api/playback/stream/token-1/ABC-001.webm' : null
  };
}

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
  if (path === '/api/javdb/rankings' || path === '/api/javdb/rankings/playback' || path === '/api/javdb/rankings/actors') return json(route, []);
  if (path === '/api/javdb/movies/top') {
    if (!javdbLoggedIn) return json(route, { error: { code: 'javdb_auth_required', message: 'TOP250 需要登录 JavDB' } }, 403);
    return json(route, [topMovie]);
  }
  if (path === '/api/javdb/search') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return json(route, [staleSearchMovie]);
  }
  if (path === '/api/tools/offline' && request.method() === 'POST') {
    const payload = JSON.parse(request.postData() ?? '{}');
    quickOfflineSubmissions.push(String(payload.url ?? ''));
    return json(route, { ok: true, task_id: 'offline-1' });
  }
  if (path === '/api/settings/javdb/login' && request.method() === 'GET') {
    return json(route, javdbLoggedIn
      ? { configured: true, ok: true, message: 'JavDB 已登录', account: { user_id: '1', username: 'javdb-user', email: null, is_vip: false, vip_expired_at: null } }
      : { configured: false, ok: false, message: '未登录 JavDB 账号', account: null });
  }
  if (path === '/api/settings/javdb/login' && request.method() === 'POST') {
    javdbLoggedIn = true;
    return json(route, { ok: true, account: { user_id: '1', username: 'javdb-user', email: null, is_vip: false, vip_expired_at: null } });
  }
  if (path === '/api/settings/javdb/logout') {
    javdbLoggedIn = false;
    return json(route, { ok: true });
  }
  if (path === '/api/settings' && request.method() === 'GET') return json(route, settingsFixture());
  if (path === '/api/settings' && request.method() === 'PUT') {
    savedSettings = JSON.parse(request.postData() ?? '{}').items ?? [];
    return json(route, { ok: true });
  }
  if (path === '/api/settings/115/login/qrcode' && request.method() === 'POST') {
    return json(route, { session_id: 'qr-1', device: 'alipaymini', qrcode_url: 'data:image/png;base64,', expires_at: '2099-01-01T00:00:00+00:00' });
  }
  if (path === '/api/settings/115/login/qrcode/qr-1') {
    p115Cookie = 'UID=new_R2_2;CID=new;';
    return json(route, { session_id: 'qr-1', status: 'succeeded', message: '115 登录成功', account: { user_id: '1', user_name: 'user' } });
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
    p115_cookie: p115Cookie,
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
    p115_completed_fc2_dir_label: '',
  };
  return Object.entries(values).map(([key, value]) => ({ key, value, is_secret: key === 'telegram_bot_token' }));
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

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
