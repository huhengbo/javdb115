import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = new URL('../dist/', import.meta.url).pathname;
const requiredFiles = [
  'manifest.webmanifest',
  'sw.js',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png'
];

await Promise.all(requiredFiles.map((file) => access(join(distDir, file))));

const manifest = JSON.parse(await readFile(join(distDir, 'manifest.webmanifest'), 'utf8'));
if (manifest.name !== 'JAVDB 115') {
  throw new Error('PWA manifest name is invalid');
}
if (manifest.display !== 'standalone') {
  throw new Error('PWA manifest must use standalone display mode');
}
if (manifest.start_url !== '/') {
  throw new Error('PWA manifest start_url must be /');
}

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const sizes = new Set(icons.map((icon) => icon.sizes));
if (!sizes.has('192x192') || !sizes.has('512x512')) {
  throw new Error('PWA manifest must include 192x192 and 512x512 icons');
}
if (!icons.some((icon) => String(icon.purpose ?? '').split(/\s+/).includes('maskable'))) {
  throw new Error('PWA manifest must include a maskable icon');
}

console.log('PWA build artifacts verified');
