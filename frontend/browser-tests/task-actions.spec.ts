import { expect, test, type Page, type Route } from '@playwright/test';
import { URL } from 'node:url';

const task = {
  id: 42, status: 'completed', stage: '115_organized', error_message: null,
  cloud_task_id: 'cloud-42', cloud_file_id: 'file-42', cloud_file_name: 'TEST-42',
  created_at: '2026-09-21T10:00:00Z', updated_at: '2026-09-21T10:05:00Z',
  work: { id: 7, code: 'TEST-42', title: '测试任务标题', cover_url: '',
    release_date: '2026-09-01', source_url: '', actors: [], status: 'completed' },
  actor: null, magnet: null
};

async function setup(page: Page) {
  let items = [task];
  let deletions = 0;
  let failDelete = false;
  let releaseRefresh: (() => void) | undefined;
  let holdRefresh = false;
  let fetches = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return json(route, { username: 'admin' });
    if (url.pathname === '/api/follows') return json(route, []);
    if (url.pathname === '/api/tasks/42' && route.request().method() === 'DELETE') {
      deletions++;
      if (failDelete) return json(route, { error: { message: '删除失败，请重试' } }, 503);
      items = [];
      return json(route, { ok: true });
    }
    if (url.pathname === '/api/tasks') {
      fetches++;
      const snapshot = [...items];
      if (holdRefresh) {
        holdRefresh = false;
        await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      }
      return json(route, payload(snapshot));
    }
    if (url.pathname === '/api/dashboard') return json(route, {
      stats: { submitted: 0, downloading: 0, organizing: 0, completed: items.length, failed: 0 },
      task_breakdown: { by_status: {}, by_stage: {}, attention: 0 },
      connections: { p115: { ok: true, checked_at: null }, javdb: { ok: true, checked_at: null } },
      attention_tasks: [], recent_tasks: items
    });
    return json(route, []);
  });
  await page.goto('/tasks');
  await expect(page.getByText('测试任务标题', { exact: true })).toBeVisible();
  return {
    deletions: () => deletions,
    fetches: () => fetches,
    failDelete: (value: boolean) => { failDelete = value; },
    holdRefresh: () => { holdRefresh = true; },
    releaseRefresh: () => releaseRefresh?.()
  };
}

async function longPress(page: Page) {
  const title = page.getByText('测试任务标题', { exact: true });
  await title.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: 120, clientY: 220 });
  await page.waitForTimeout(600);
  await title.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, pointerType: 'touch' });
}

async function openDelete(page: Page) {
  await page.getByRole('button', { name: '更多操作 TEST-42' }).click();
  await page.getByRole('dialog', { name: '任务操作' }).getByRole('button', { name: '删除记录', exact: true }).click();
  return page.getByRole('dialog', { name: '删除任务记录' });
}

test('long press opens task actions; cancelling and confirming are separate operations', async ({ page }) => {
  const state = await setup(page);
  await longPress(page);
  const actions = page.getByRole('dialog', { name: '任务操作' });
  await expect(actions).toBeVisible();
  expect(state.deletions()).toBe(0);
  await actions.getByRole('button', { name: '删除记录', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '删除任务记录' });
  await expect(confirmation).toContainText('不会取消 115 离线任务，也不会删除网盘文件');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(state.deletions()).toBe(0);
  await expect(page.getByText('测试任务标题', { exact: true })).toBeVisible();
  const again = await openDelete(page);
  await again.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  await expect(page.getByText('全部 · 0 条', { exact: true })).toBeVisible();
  expect(state.deletions()).toBe(1);
});

for (const event of ['pointermove', 'pointercancel', 'pointerleave']) {
  test(`${event} cancels long press instead of interpreting scrolling as deletion`, async ({ page }) => {
    const state = await setup(page);
    const title = page.getByText('测试任务标题', { exact: true });
    await title.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: 120, clientY: 220 });
    // React derives onPointerLeave from the bubbling native pointerout event.
    await title.dispatchEvent(event === 'pointerleave' ? 'pointerout' : event, { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 120, clientY: 250, relatedTarget: null });
    await page.waitForTimeout(600);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.deletions()).toBe(0);
  });
}

test('short click still expands a task and the more button supports keyboard dismissal', async ({ page }) => {
  await setup(page);
  await page.getByText('测试任务标题', { exact: true }).click();
  await expect(page.getByText('演员：未知', { exact: true })).toBeVisible();
  const more = page.getByRole('button', { name: '更多操作 TEST-42' });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '任务操作' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('deletion failure keeps the task and allows an explicit retry', async ({ page }) => {
  const state = await setup(page);
  state.failDelete(true);
  const confirmation = await openDelete(page);
  await confirmation.getByRole('button', { name: '删除', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('删除失败，请重试');
  expect(state.deletions()).toBe(1);
  state.failDelete(false);
  await confirmation.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  expect(state.deletions()).toBe(2);
});

test('deleting during a refresh hides the task immediately and queues fresh counts', async ({ page }) => {
  const state = await setup(page);
  const before = state.fetches();
  state.holdRefresh();
  await page.getByRole('button', { name: '刷新任务列表' }).click();
  await expect.poll(state.fetches).toBe(before + 1);
  const confirmation = await openDelete(page);
  await confirmation.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  state.releaseRefresh();
  await expect(page.getByText('全部 · 0 条', { exact: true })).toBeVisible();
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  expect(state.fetches()).toBeGreaterThan(before + 1);
});

test('compact dashboard cards have the same deletion actions', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/');
  await expect(page.getByText('测试任务标题', { exact: true })).toBeVisible();
  await longPress(page);
  await page.getByRole('dialog', { name: '任务操作' }).getByRole('button', { name: '删除记录', exact: true }).click();
  await page.getByRole('dialog', { name: '删除任务记录' }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  expect(state.deletions()).toBe(1);
});

function payload(items: typeof task[]) {
  return { items, has_more: false, next_cursor: null, total: items.length,
    counts: { all: items.length, attention: 0, submitted: 0, downloading: 0, organizing: 0,
      completed: items.length, submit_failed: 0, download_failed: 0, organize_failed: 0, incomplete_submit: 0 } };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('a real touch long press opens the action sheet above navigation', async ({ page }, testInfo) => {
  await setup(page);
  const bounds = await page.getByText('测试任务标题', { exact: true }).boundingBox();
  if (!bounds) throw new Error('Missing task title bounds');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const dialog = page.getByRole('dialog', { name: '任务操作' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('task-long-press.png') });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('desktop task actions can be dismissed by clicking the backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page);
  await page.getByRole('button', { name: '更多操作 TEST-42' }).click();
  await expect(page.getByRole('dialog', { name: '任务操作' })).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('repeated confirmation clicks submit only one deletion', async ({ page }) => {
  const state = await setup(page);
  const confirmation = await openDelete(page);
  await confirmation.getByRole('button', { name: '删除', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText('测试任务标题', { exact: true })).toHaveCount(0);
  expect(state.deletions()).toBe(1);
});

test('keyboard actions remain usable after cancelling a long press', async ({ page }) => {
  await setup(page);
  await longPress(page);
  await page.getByRole('dialog', { name: '任务操作' }).getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '更多操作 TEST-42' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '任务操作' })).toBeVisible();
});
