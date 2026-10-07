/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'defects.html');

let initDefectsApp;
let POLL_INTERVAL_MS;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  window.location.hash = '';
  jest.resetModules();
  ({ initDefectsApp, POLL_INTERVAL_MS } = require('../public/js/defects'));
});
afterEach(() => { jest.useRealTimers(); });

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const pageOf = (items, extra = {}) => ({ items, page: 1, pageSize: 5, totalItems: items.length, totalPages: 1, ...extra });
const makeItems = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({
  id: `DEF-${2000 + offset + i}`, title: `Bug ${offset + i}`, status: 'New', updatedAt: '2026-10-07T09:12:00Z',
}));

test('AC1: each row shows id, title and status', async () => {
  const api = { list: jest.fn().mockResolvedValue(pageOf([
    { id: 'DEF-1046', title: 'Payment bug', status: 'In Progress', updatedAt: '2026-10-07T09:12:00Z', projectName: 'Checkout Experience' },
  ])) };
  initDefectsApp(document, api);
  await flush();
  const row = document.querySelector('.defect-row');
  expect(row.textContent).toContain('DEF-1046');
  expect(row.textContent).toContain('Payment bug');
  expect(row.textContent).toContain('In Progress');
});

test('AC2: opening a defect shows all of its details', async () => {
  const defect = {
    id: 'DEF-1', title: 'Bug', description: 'Desc', steps: 'Steps', environment: 'Env', severity: 'High',
    status: 'New', reportedBy: 'Priya', reportedAt: '2026-10-07', updatedBy: 'Dana', updatedAt: '2026-10-07T09:12:00Z', projectName: 'Search',
  };
  const api = { list: jest.fn().mockResolvedValue(pageOf([defect])), get: jest.fn().mockResolvedValue(defect) };
  window.location.hash = '#/defects/DEF-1';
  initDefectsApp(document, api);
  await flush();
  expect(api.get).toHaveBeenCalledWith('DEF-1');
  expect(document.getElementById('detail-project').textContent).toBe('Search');
  expect(document.getElementById('detail-description').textContent).toBe('Desc');
  expect(document.getElementById('detail-steps').textContent).toBe('Steps');
  expect(document.getElementById('detail-environment').textContent).toBe('Env');
  expect(document.getElementById('detail-severity').textContent).toBe('High');
  expect(document.getElementById('detail-updated-meta').textContent).toContain('Dana');
  expect(document.getElementById('detail-status-chip').textContent).toContain('New');
});

test('AC3: a status change made elsewhere appears without any manual refresh step', async () => {
  jest.useFakeTimers();
  const api = {
    list: jest.fn()
      .mockResolvedValueOnce(pageOf([{ id: 'DEF-1038', title: 'Email bug', status: 'In Progress', updatedAt: 't1' }]))
      .mockResolvedValueOnce(pageOf([{ id: 'DEF-1038', title: 'Email bug', status: 'Closed', updatedAt: 't2' }])),
  };
  initDefectsApp(document, api);
  await flush();
  expect(document.querySelector('.defect-row').textContent).toContain('In Progress');
  jest.advanceTimersByTime(POLL_INTERVAL_MS);
  await flush();
  expect(document.querySelector('.defect-row').textContent).toContain('Closed');
});

test('AC3: an open detail view refreshes on the poll tick', async () => {
  jest.useFakeTimers();
  const base = { id: 'DEF-7', title: 'Bug', reportedAt: '2026-10-07' };
  const api = {
    list: jest.fn().mockResolvedValue(pageOf([])),
    get: jest.fn()
      .mockResolvedValueOnce({ ...base, status: 'New' })
      .mockResolvedValueOnce({ ...base, status: 'Resolved' }),
  };
  window.location.hash = '#/defects/DEF-7';
  initDefectsApp(document, api);
  await flush();
  expect(document.getElementById('detail-status-chip').textContent).toContain('New');
  jest.advanceTimersByTime(POLL_INTERVAL_MS);
  await flush();
  expect(document.getElementById('detail-status-chip').textContent).toContain('Resolved');
});

test('AC4: a 401 from the list API shows a sign-in message and no defect rows', async () => {
  const api = { list: jest.fn().mockRejectedValue({ status: 401, error: 'unauthorized' }) };
  initDefectsApp(document, api);
  await flush();
  expect(document.querySelectorAll('.defect-row')).toHaveLength(0);
  expect(document.getElementById('list-signed-out').hidden).toBe(false);
});

test('AC4: a 401 from the detail API shows a sign-in message and no details', async () => {
  const api = {
    list: jest.fn().mockResolvedValue(pageOf([])),
    get: jest.fn().mockRejectedValue({ status: 401, error: 'unauthorized' }),
  };
  window.location.hash = '#/defects/DEF-1';
  initDefectsApp(document, api);
  await flush();
  expect(document.getElementById('detail-signed-out').hidden).toBe(false);
  expect(document.getElementById('detail-success').hidden).toBe(true);
});

test('AC6: pagination controls move between pages', async () => {
  const api = {
    list: jest.fn()
      .mockResolvedValueOnce(pageOf(makeItems(5), { totalItems: 7, totalPages: 2 }))
      .mockResolvedValueOnce(pageOf(makeItems(2, 5), { page: 2, totalItems: 7, totalPages: 2 }))
      .mockResolvedValueOnce(pageOf(makeItems(5), { totalItems: 7, totalPages: 2 })),
  };
  initDefectsApp(document, api);
  await flush();
  expect(document.getElementById('pg-prev').disabled).toBe(true);
  document.getElementById('pg-next').click();
  await flush();
  expect(api.list).toHaveBeenLastCalledWith(2);
  expect(document.querySelector('.pagination-status').textContent).toBe('Page 2 of 2');
  expect(document.getElementById('pg-next').disabled).toBe(true);
  document.getElementById('pg-prev').click();
  await flush();
  expect(api.list).toHaveBeenLastCalledWith(1);
});

test('AC7: no defects for any member project shows an explicit empty-state message', async () => {
  const api = { list: jest.fn().mockResolvedValue(pageOf([])) };
  initDefectsApp(document, api);
  await flush();
  expect(document.getElementById('defect-list-empty').hidden).toBe(false);
});

test("AC8/AC9: a defect id the API 404s on shows 'Defect not found' inside the detail layout", async () => {
  const api = {
    list: jest.fn().mockResolvedValue(pageOf([])),
    get: jest.fn().mockRejectedValue({ status: 404, error: 'defect not found' }),
  };
  window.location.hash = '#/defects/DEF-9999';
  initDefectsApp(document, api);
  await flush();
  const notFound = document.getElementById('detail-not-found');
  expect(notFound.hidden).toBe(false);
  expect(notFound.textContent).toContain('Defect not found');
  expect(notFound.closest('.screen').style.display).toBe('block');
  expect(document.getElementById('detail-success').hidden).toBe(true);
});
