/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'availability.html');

let initAvailabilityApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initAvailabilityApp } = require('../public/js/availability'));
});

const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const job = { id: 'JOB-1', customerName: 'Dana Whitfield', address: '1 Main St', scheduledStart: '2026-10-09T09:00:00', scheduledEnd: '2026-10-09T10:00:00', status: 'Assigned' };
const makeApi = (over = {}) => ({
  getStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: true, updatedAt: null }),
  setStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: false, updatedAt: 'Just now' }),
  listAssignments: jest.fn().mockResolvedValue([]),
  ...over,
});

test('AC1/AC2: clicking the switch flips the heading and aria-checked once the save resolves', async () => {
  const api = makeApi();
  initAvailabilityApp(document, api);
  await flush();
  document.getElementById('avail-switch').click();
  await flush();
  expect(api.setStatus).toHaveBeenCalledWith(false);
  expect(document.getElementById('avail-switch').getAttribute('aria-checked')).toBe('false');
  expect(document.getElementById('status-heading').textContent).toMatch(/unavailable/i);
});

test('AC2: switching back sends available=true', async () => {
  const api = makeApi({ getStatus: jest.fn().mockResolvedValue({ available: false }), setStatus: jest.fn().mockResolvedValue({ available: true }) });
  initAvailabilityApp(document, api);
  await flush();
  document.getElementById('avail-switch').click();
  await flush();
  expect(api.setStatus).toHaveBeenCalledWith(true);
  expect(document.getElementById('avail-switch').getAttribute('aria-checked')).toBe('true');
});

test('AC3: toggling availability does not reload or change the assignments list', async () => {
  const api = makeApi({ listAssignments: jest.fn().mockResolvedValue([job]) });
  initAvailabilityApp(document, api);
  await flush();
  const before = document.getElementById('assignments-list').innerHTML;
  expect(before).toContain('Dana Whitfield');
  document.getElementById('avail-switch').click();
  await flush();
  expect(api.listAssignments).toHaveBeenCalledTimes(1);
  expect(document.getElementById('assignments-list').innerHTML).toBe(before);
});

test('a failed save re-enables the switch, keeps state and shows the retry banner', async () => {
  const api = makeApi({ setStatus: jest.fn().mockRejectedValue({ status: 500 }) });
  initAvailabilityApp(document, api);
  await flush();
  document.getElementById('avail-switch').click();
  await flush();
  expect(document.getElementById('avail-switch').disabled).toBe(false);
  expect(document.getElementById('avail-switch').getAttribute('aria-checked')).toBe('true');
  expect(document.getElementById('save-error-banner').hidden).toBe(false);
});

test('assignments error and empty states render independently of the switch', async () => {
  initAvailabilityApp(document, makeApi({ listAssignments: jest.fn().mockRejectedValue({}) }));
  await flush();
  expect(document.getElementById('assignments-error').hidden).toBe(false);
  expect(document.getElementById('status-card-wrap').hidden).toBe(false);
});
