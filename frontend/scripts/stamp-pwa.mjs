import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(scriptDir, '..', 'dist');
const serviceWorkerPath = join(distDir, 'sw.js');
const assetEntries = await readdir(join(distDir, 'assets'), { withFileTypes: true });
const assetUrls = assetEntries
  .filter((entry) => entry.isFile())
  .map((entry) => `/assets/${entry.name}`)
  .sort();
const precacheUrls = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  ...assetUrls
];
const buildId = (env.GITHUB_SHA || env.REVISION || String(Date.now())).slice(0, 16);
let serviceWorker = await readFile(serviceWorkerPath, 'utf8');

if (!serviceWorker.includes('__PWA_BUILD_ID__') || !serviceWorker.includes('__PWA_ASSET_LIST__')) {
  throw new Error('PWA service worker placeholders are missing');
}

serviceWorker = serviceWorker
  .replace('__PWA_BUILD_ID__', buildId)
  .replace('__PWA_ASSET_LIST__', JSON.stringify(precacheUrls));
await writeFile(serviceWorkerPath, serviceWorker);
stdout.write(`Stamped PWA service worker ${buildId} with ${precacheUrls.length} assets\n`);
