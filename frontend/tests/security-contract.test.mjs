import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('browser authentication uses server-managed cookies instead of localStorage tokens', () => {
  const api = source('../src/api.ts');
  assert.doesNotMatch(api, /localStorage/);
  assert.doesNotMatch(api, /Authorization.*Bearer/);
  assert.match(api, /credentials:\s*'same-origin'/);
  assert.match(api, /\/api\/auth\/me/);
  assert.match(api, /\/api\/auth\/logout/);
});

test('login page does not persist a returned token', () => {
  const login = source('../src/pages/LoginPage.tsx');
  assert.doesNotMatch(login, /setToken|getToken|localStorage/);
  assert.match(login, /await login\(username, password\)/);
});

test('secret settings are described as write-only', () => {
  const settings = source('../src/components/settings/SettingsFields.tsx');
  assert.match(settings, /敏感值不会从服务器回显/);
  assert.match(settings, /留空保存会保持现有值/);
});
