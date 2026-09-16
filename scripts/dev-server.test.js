import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { resolveStaticPath } from './dev-server.js';

const ROOT = '/workspace';

test('serves index.html for the root path', () => {
  assert.equal(resolveStaticPath(ROOT, '/'), resolve(ROOT, 'index.html'));
});

test('resolves a normal relative asset path within the root', () => {
  assert.equal(resolveStaticPath(ROOT, '/src/main.js'), resolve(ROOT, 'src/main.js'));
});

test('contains an absolute-looking request path within the root (e.g. /etc/passwd)', () => {
  const filePath = resolveStaticPath(ROOT, '/etc/passwd');
  assert.equal(filePath, resolve(ROOT, 'etc/passwd'));
  assert.equal(filePath.startsWith(resolve(ROOT) + sep), true);
});

test('rejects a relative traversal escape attempt', () => {
  assert.equal(resolveStaticPath(ROOT, '/../../etc/passwd'), null);
});
