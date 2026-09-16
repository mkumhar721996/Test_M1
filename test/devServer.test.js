import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../scripts/dev-server.mjs';

function request(app, url) {
  return new Promise((resolve) => {
    let status;
    const res = {
      writeHead(code) {
        status = code;
      },
      end(body) {
        resolve({ status, body });
      },
    };
    app({ url }, res);
  });
}

test('serves a real file under the project root', async () => {
  const app = createApp();
  const { status } = await request(app, '/package.json');
  assert.equal(status, 200);
});

test('blocks path traversal outside the project root', async () => {
  const app = createApp();
  const { status } = await request(app, '/../../../../etc/passwd');
  assert.equal(status, 403);
});

test('blocks encoded path traversal outside the project root', async () => {
  const app = createApp();
  const { status } = await request(app, '/%2e%2e/%2e%2e/%2e%2e/etc/passwd');
  assert.equal(status, 403);
});
