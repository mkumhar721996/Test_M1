/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'my-requests.html');

let initMyRequestsApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  window.location.hash = '';
  jest.resetModules();
  ({ initMyRequestsApp } = require('../public/js/my-requests'));
});

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const make = (id, status, extra = {}) => ({
  id, customerId: 'cust-204', status, categoryId: 'plumbing', categoryName: 'Plumbing',
  description: 'Leaking sink', preferredDate: '2026-10-10', timeWindowId: 'morning',
  timeWindowLabel: 'Morning (8am–11am)', submittedAt: '2026-10-08T09:00:00.000Z',
  address: { street: '1 Main St', unit: '', city: 'Austin', state: 'TX', zip: '78701' }, ...extra,
});
const start = async (api) => { initMyRequestsApp(document, api); await flush(); };

test('only Pending cards offer Edit and Cancel', async () => {
  await start({ listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending'), make('REQ-2', 'Assigned'), make('REQ-3', 'Cancelled')]) });
  const card = (id) => document.querySelector(`[data-request-card="${id}"]`);
  expect(card('REQ-1').querySelector('[data-edit]')).not.toBeNull();
  expect(card('REQ-1').querySelector('[data-cancel]')).not.toBeNull();
  expect(card('REQ-2').querySelector('[data-edit]')).toBeNull();
  expect(card('REQ-3').querySelector('[data-cancel]')).toBeNull();
});

test('AC1: confirming the cancel modal cancels the request and shows a toast', async () => {
  const api = {
    listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]),
    cancel: jest.fn().mockResolvedValue(make('REQ-1', 'Cancelled', { cancelledAt: '2026-10-08T10:00:00.000Z' })),
  };
  await start(api);
  document.querySelector('[data-cancel="REQ-1"]').click();
  expect(document.getElementById('cancel-modal-wrap').hidden).toBe(false);
  document.getElementById('cancel-modal-confirm').click();
  await flush();
  expect(api.cancel).toHaveBeenCalledWith('REQ-1');
  expect(document.getElementById('toast').textContent).toBe('Request cancelled.');
  expect(document.querySelector('[data-cancel="REQ-1"]')).toBeNull();
});

test('AC2: saving the edit form submits the new values and the detail view reflects them', async () => {
  const api = {
    listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]),
    update: jest.fn().mockResolvedValue(make('REQ-1', 'Pending', { description: 'New description' })),
  };
  await start(api);
  document.querySelector('[data-edit="REQ-1"]').click();
  await flush();
  expect(document.getElementById('edit-description').value).toBe('Leaking sink');
  document.getElementById('edit-description').value = 'New description';
  document.getElementById('edit-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush();
  expect(api.update).toHaveBeenCalledWith('REQ-1', expect.objectContaining({ description: 'New description' }));
  expect(document.getElementById('detail-description').textContent).toBe('New description');
  expect(document.getElementById('toast').textContent).toBe('Request updated.');
});

test('AC2: an incomplete edit is blocked client-side', async () => {
  const api = { listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]), update: jest.fn() };
  await start(api);
  document.querySelector('[data-edit="REQ-1"]').click();
  await flush();
  document.getElementById('edit-description').value = '  ';
  document.getElementById('edit-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush();
  expect(api.update).not.toHaveBeenCalled();
  expect(document.getElementById('edit-description-error').hidden).toBe(false);
});

test('AC3: a 409 on cancel shows the rejection banner and re-renders the request locked', async () => {
  const api = {
    listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]),
    cancel: jest.fn().mockRejectedValue({ status: 409 }),
    get: jest.fn().mockResolvedValue(make('REQ-1', 'Assigned')),
  };
  await start(api);
  document.querySelector('[data-cancel="REQ-1"]').click();
  document.getElementById('cancel-modal-confirm').click();
  await flush();
  expect(document.querySelector('#detail-rejection-banner [role="alert"]')).not.toBeNull();
  expect(document.querySelector('[data-cancel="REQ-1"]')).toBeNull();
  expect(document.getElementById('cancel-modal-wrap').hidden).toBe(true);
});

test('AC3: a 409 on edit save shows the rejection banner and locks the request', async () => {
  const api = {
    listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]),
    update: jest.fn().mockRejectedValue({ status: 409 }),
    get: jest.fn().mockResolvedValue(make('REQ-1', 'Assigned')),
  };
  await start(api);
  document.querySelector('[data-edit="REQ-1"]').click();
  await flush();
  document.getElementById('edit-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush();
  expect(document.querySelector('#detail-rejection-banner [role="alert"]')).not.toBeNull();
  expect(document.querySelector('[data-edit="REQ-1"]')).toBeNull();
});

test('AC4: opening a request that 404s shows the denied state and no details', async () => {
  window.location.hash = '#/requests/REQ-9001';
  const api = {
    listMine: jest.fn().mockResolvedValue([make('REQ-1', 'Pending')]),
    get: jest.fn().mockRejectedValue({ status: 404 }),
  };
  await start(api);
  expect(document.getElementById('detail-denied').hidden).toBe(false);
  expect(document.getElementById('detail-content').hidden).toBe(true);
});

test('baseline: loading skeleton, error with retry, and empty state', async () => {
  let reject;
  const api = { listMine: jest.fn().mockReturnValueOnce(new Promise((_, r) => { reject = r; })) };
  initMyRequestsApp(document, api);
  expect(document.getElementById('list-loading').hidden).toBe(false);
  reject(new Error('x'));
  await flush();
  expect(document.getElementById('list-error').hidden).toBe(false);
  api.listMine.mockResolvedValueOnce([]);
  document.getElementById('list-retry').click();
  await flush();
  expect(document.getElementById('request-list-empty').hidden).toBe(false);
});
