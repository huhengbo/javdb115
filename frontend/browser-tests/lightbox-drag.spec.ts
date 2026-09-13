import { expect, test, type Route } from '@playwright/test';
import { URL } from 'node:url';

const image = (label: string) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400'%3E%3Crect width='300' height='400' fill='%23222'/%3E%3Ctext x='20' y='60' fill='white'%3E${label}%3C/text%3E%3C/svg%3E`;
const previews = [1, 2, 3].map((value) => ({ thumb_url: image(`thumb-${value}`), large_url: image(`large-${value}`) }));

const latestMovie = {
  id: 'drag-movie',
  number: 'DRAG-001',
  title: '拖拽预览测试',
  thumb_url: '',
  cover_url: '',
  duration: 120,
  release_date: '2026-09-01',
  score: '4.2',
  can_play: true,
  has_cnsub: false,
  has_preview_images: true,
  magnets_count: 1,
  preview_images: previews
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => handleApi(route));
});

test('lightbox tracks horizontal pointer drag and settles to cached adjacent images without a stuck loader', async ({ page }) => {
  await page.goto('/discovery');
  await page.getByText('DRAG-001', { exact: true }).click();
  await page.getByRole('button', { name: '查看预览图 1/3' }).click();

  const dialog = page.getByRole('dialog', { name: '预览图 1/3' });
  await expect(dialog).toBeVisible();
  const currentImage = page.getByAltText('作品预览图 1');
  await expect(currentImage).toBeVisible();
  await expect(currentImage).toHaveClass(/opacity-100/);
  await page.waitForTimeout(120);

  const slide = currentImage.locator('..');
  const box = await slide.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  const startX = box.x + box.width * 0.65;
  const y = box.y + box.height * 0.55;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 90, y, { steps: 6 });
  await expect(slide).toHaveAttribute('style', /translate3d\(-[1-9][0-9]*px/);
  await page.mouse.up();

  await expect(page.getByRole('dialog', { name: '预览图 2/3' })).toBeVisible();
  const secondImage = page.getByAltText('作品预览图 2');
  await expect(secondImage).toHaveClass(/opacity-100/);
  await expect(page.getByText('大图加载中...')).toHaveCount(0);

  await page.getByRole('button', { name: '上一张预览图' }).click();
  await expect(page.getByRole('dialog', { name: '预览图 1/3' })).toBeVisible();
  await expect(page.getByAltText('作品预览图 1')).toHaveClass(/opacity-100/);
  await expect(page.getByText('大图加载中...')).toHaveCount(0);
});

test('short slow drag returns to the current image and desktop buttons still work', async ({ page }) => {
  await page.goto('/discovery');
  await page.getByText('DRAG-001', { exact: true }).click();
  await page.getByRole('button', { name: '查看预览图 1/3' }).click();

  const currentImage = page.getByAltText('作品预览图 1');
  const box = await currentImage.locator('..').boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const startX = box.x + box.width * 0.55;
  const y = box.y + box.height * 0.5;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 8, y);
  await page.waitForTimeout(80);
  await page.mouse.move(startX - 16, y);
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(220);

  await expect(page.getByRole('dialog', { name: '预览图 1/3' })).toBeVisible();
  await page.getByRole('button', { name: '下一张预览图' }).click();
  await expect(page.getByRole('dialog', { name: '预览图 2/3' })).toBeVisible();
  await expect(page.getByAltText('作品预览图 2')).toHaveClass(/opacity-100/);
  await expect(page.getByText('大图加载中...')).toHaveCount(0);
});

async function handleApi(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') return json(route, { username: 'admin' });
  if (path === '/api/follows') return json(route, []);
  if (path === '/api/javdb/movies/latest') return json(route, [latestMovie]);
  if (path === '/api/javdb/movies/drag-movie/bundle') {
    return json(route, {
      detail: {
        id: 'drag-movie',
        number: 'DRAG-001',
        title: '拖拽预览测试',
        cover_url: '',
        duration: 120,
        score: '4.2',
        release_date: '2026-09-01',
        has_cnsub: false,
        has_preview_images: true,
        actors: [],
        tags: [],
        preview_images: previews,
        relative_movies: [],
        actor_movies: []
      },
      magnets: [],
      reviews: [],
      reviews_error: null
    });
  }
  if (path === '/api/tasks/by-work/DRAG-001') return json(route, []);
  return json(route, {});
}

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
