/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'services.html');
const catalog = {
  categories: [{ id: 'plumbing', name: 'Plumbing', icon: 'P', description: 'Pipes', duration: '1h', fields: [] }],
  timeWindows: [{ id: 'evening', label: 'Evening', staffed: false }],
};
const row = (id, staffed) => ({
  id, categoryId: 'plumbing', categoryName: 'Plumbing', preferredDate: '2026-10-10', timeWindowLabel: 'Evening',
  address: { street: '1 Main', unit: '', city: 'Austin', state: 'TX', zip: '78701' },
  staffed, status: 'Pending', submittedAt: '2026-10-08T10:00:00.000Z',
});

let initServicesApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  window.location.hash = '';
  jest.resetModules();
  ({ initServicesApp } = require('../public/js/services'));
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

test('AC6/AC7: queue is reachable by hash and shows Pending rows with an unstaffed badge', async () => {
  const api = {
    getCatalog: jest.fn().mockResolvedValue(catalog),
    createRequest: jest.fn(),
    listQueue: jest.fn().mockResolvedValue([row('REQ-2', false), row('REQ-1', true)]),
  };
  initServicesApp(document, api);
  await flush();
  expect(api.listQueue).not.toHaveBeenCalled();
  expect(document.querySelector('a[href="#/admin/queue"]')).toBeNull();
  window.location.hash = '#/admin/queue';
  window.dispatchEvent(new Event('hashchange'));
  await flush();
  const r2 = document.querySelector('.queue-row[data-id="REQ-2"]');
  expect(r2.querySelector('.status-chip').textContent).toContain('Pending');
  expect(r2.querySelector('.unstaffed-badge').textContent).toContain('No technician available yet');
  expect(document.querySelector('.queue-row[data-id="REQ-1"] .unstaffed-badge')).toBeNull();
});

test('queue shows an access message when the server denies the dispatcher role', async () => {
  const api = {
    getCatalog: jest.fn().mockResolvedValue(catalog),
    createRequest: jest.fn(),
    listQueue: jest.fn().mockRejectedValue({ status: 403 }),
  };
  initServicesApp(document, api);
  await flush();
  window.location.hash = '#/admin/queue';
  window.dispatchEvent(new Event('hashchange'));
  await flush();
  expect(document.getElementById('queue-empty').hidden).toBe(false);
  expect(document.getElementById('queue-empty').textContent).toContain('dispatcher account');
  expect(document.querySelector('.queue-row')).toBeNull();
});
