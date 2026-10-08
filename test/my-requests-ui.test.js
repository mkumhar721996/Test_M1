/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'my-requests.html');

let initMyRequestsApp;
let createDefaultApi;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  window.location.hash = '';
  jest.resetModules();
  ({ initMyRequestsApp, createDefaultApi } = require('../public/js/my-requests'));
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const req = (over = {}) => ({
  id: 'REQ-1', category: 'Plumbing', description: 'Leaking sink', address: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
  submittedAt: '2026-10-01T10:00:00Z', status: 'Submitted', technician: null, scheduledWindow: null, ...over,
});
const chips = () => [...document.querySelectorAll('.status-chip')].map((c) => c.textContent);

test('AC1: every status label is rendered on the list', async () => {
  const statuses = ['Submitted', 'Assigned', 'In Progress', 'Completed', 'Cancelled'];
  const api = { list: jest.fn().mockResolvedValue(statuses.map((status, i) => req({ id: `REQ-${i}`, status }))) };
  initMyRequestsApp(document, api);
  await flush();
  statuses.forEach((s) => expect(chips().some((c) => c.includes(s))).toBe(true));
});

test('AC2: open and past requests render in their own sections', async () => {
  const api = { list: jest.fn().mockResolvedValue([req({ id: 'REQ-A', status: 'Assigned' }), req({ id: 'REQ-C', status: 'Completed' })]) };
  initMyRequestsApp(document, api);
  await flush();
  expect(document.getElementById('open-heading').hidden).toBe(false);
  expect(document.getElementById('past-heading').hidden).toBe(false);
  expect(document.querySelector('#request-list [data-view-request="REQ-A"]')).not.toBeNull();
  expect(document.querySelector('#past-request-list [data-view-request="REQ-C"]')).not.toBeNull();
});

test('AC3: assigned technician is shown', async () => {
  const api = { list: jest.fn().mockResolvedValue([req({ status: 'Assigned', technician: 'Marcus Webb' })]) };
  initMyRequestsApp(document, api);
  await flush();
  expect(document.querySelector('.tech-line').textContent).toContain('Marcus Webb');
});

test('AC4/AC5: unassigned request shows no technician and a pending status', async () => {
  const api = { list: jest.fn().mockResolvedValue([req()]) };
  initMyRequestsApp(document, api);
  await flush();
  expect(document.querySelector('.tech-line')).toBeNull();
  expect(document.querySelector('.no-tech-line').textContent).toContain('Not yet assigned');
  expect(document.querySelector('.status-chip').textContent).toContain('Submitted');
});

test('AC7: opening a request shows its status and technician', async () => {
  const item = req({ id: 'REQ-77', status: 'In Progress', technician: 'Dana Whitfield' });
  const api = { list: jest.fn().mockResolvedValue([item]), get: jest.fn().mockResolvedValue(item) };
  initMyRequestsApp(document, api);
  await flush();
  document.querySelector('[data-view-request="REQ-77"]').click();
  await flush();
  expect(api.get).toHaveBeenCalledWith('REQ-77');
  expect(document.querySelector('.screen[data-name="Request Detail"]').style.display).toBe('block');
  expect(document.getElementById('detail-status-chip').textContent).toContain('In Progress');
  expect(document.getElementById('detail-tech-slot').textContent).toContain('Dana Whitfield');
});

test('detail: cancelled shows banner instead of tracker; no technician shows placeholder', async () => {
  const item = req({ id: 'REQ-9', status: 'Cancelled' });
  const api = { list: jest.fn().mockResolvedValue([item]), get: jest.fn().mockResolvedValue(item) };
  initMyRequestsApp(document, api);
  await flush();
  document.querySelector('[data-view-request="REQ-9"]').click();
  await flush();
  expect(document.querySelector('.cancelled-banner')).not.toBeNull();
  expect(document.querySelector('.status-track')).toBeNull();
  expect(document.getElementById('detail-tech-slot').textContent).toContain('Not yet assigned');
});

test('AC9: reopening a request fetches fresh data', async () => {
  const v1 = req({ id: 'REQ-5', status: 'Submitted' });
  const v2 = req({ id: 'REQ-5', status: 'Assigned', technician: 'Marcus Webb' });
  const api = {
    list: jest.fn().mockResolvedValue([v1]),
    get: jest.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v2),
  };
  initMyRequestsApp(document, api);
  await flush();
  document.querySelector('[data-view-request="REQ-5"]').click();
  await flush();
  document.getElementById('back-to-list').click();
  await flush();
  document.querySelector('[data-view-request="REQ-5"]').click();
  await flush();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(document.getElementById('detail-status-chip').textContent).toContain('Assigned');
  expect(document.getElementById('detail-tech-slot').textContent).toContain('Marcus Webb');
});

test('AC10: no status-changing controls on list or detail', async () => {
  const item = req({ status: 'Assigned', technician: 'Marcus Webb' });
  const api = { list: jest.fn().mockResolvedValue([item]), get: jest.fn().mockResolvedValue(item) };
  initMyRequestsApp(document, api);
  await flush();
  const listButtons = [...document.querySelectorAll('.screen[data-name="My Requests"] button')]
    .filter((b) => !b.hasAttribute('data-view-request') && b.id !== 'list-retry');
  expect(listButtons).toHaveLength(0);
  document.querySelector('[data-view-request]').click();
  await flush();
  expect(document.querySelectorAll('.screen[data-name="Request Detail"] button')).toHaveLength(0);
});

test('empty and error states', async () => {
  initMyRequestsApp(document, { list: jest.fn().mockResolvedValue([]) });
  await flush();
  expect(document.getElementById('list-empty').hidden).toBe(false);
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  initMyRequestsApp(document, { list: jest.fn().mockRejectedValue({ status: 500 }) });
  await flush();
  expect(document.getElementById('list-error').hidden).toBe(false);
});

test('AC8: default api identifies the customer', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  await createDefaultApi().list();
  expect(global.fetch).toHaveBeenCalledWith('/repair-requests/mine', expect.objectContaining({
    headers: expect.objectContaining({ 'x-customer-id': expect.any(String) }),
  }));
});
