/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'run.html');

function loadPage() {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
}

test('clicking Pause disables the button and shows an in-progress indicator until the request resolves', async () => {
  jest.resetModules();
  loadPage();
  const { initRunApp } = require('../public/js/run');
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

  initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
  document.getElementById('pause-btn').click();

  expect(document.getElementById('pause-btn').disabled).toBe(true);
  expect(document.getElementById('pause-btn').textContent).toBe('Pausing…');

  resolveFetch({ json: async () => ({ id: 'run_1', state: 'paused' }) });
  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('run-state').textContent).toBe('paused');
});

test('clicking Cancel disables the button and shows an in-progress indicator until the request resolves', async () => {
  jest.resetModules();
  loadPage();
  const { initRunApp } = require('../public/js/run');
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

  initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
  document.getElementById('cancel-btn').click();

  expect(document.getElementById('cancel-btn').disabled).toBe(true);
  expect(document.getElementById('cancel-btn').textContent).toBe('Cancelling…');

  resolveFetch({ json: async () => ({ id: 'run_1', state: 'cancelled' }) });
  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('run-state').textContent).toBe('cancelled');
});

test('clicking Pause twice before the first request resolves sends only one network request', () => {
  jest.resetModules();
  loadPage();
  const { initRunApp } = require('../public/js/run');
  global.fetch = jest.fn(() => new Promise(() => {}));

  initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn.click();
  pauseBtn.click();

  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('clicking Cancel twice before the first request resolves sends only one network request', () => {
  jest.resetModules();
  loadPage();
  const { initRunApp } = require('../public/js/run');
  global.fetch = jest.fn(() => new Promise(() => {}));

  initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
  const cancelBtn = document.getElementById('cancel-btn');
  cancelBtn.click();
  cancelBtn.click();

  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('a failed pause request re-enables the button and shows an inline error', async () => {
  jest.resetModules();
  loadPage();
  const { initRunApp } = require('../public/js/run');
  global.fetch = jest.fn(() => Promise.reject(new Error('network error')));

  initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
  document.getElementById('pause-btn').click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('pause-btn').disabled).toBe(false);
  expect(document.getElementById('run-error').hidden).toBe(false);
});
