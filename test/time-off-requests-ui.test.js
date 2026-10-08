/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'time-off-requests.html');
const TYPES = [
  { id: 'annual', name: 'Annual leave' },
  { id: 'sick', name: 'Sick leave' },
];
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function row(overrides = {}) {
  return {
    id: 'TOR-1', employeeId: 'emp_1', leaveTypeId: 'annual', leaveTypeName: 'Annual leave', start: '2026-12-22', end: '2026-12-23', days: 2, status: 'pending', consumedDays: 0, ...overrides,
  };
}

function makeApi(overrides = {}) {
  return {
    listEmployees: jest.fn().mockResolvedValue([{ id: 'emp_1', name: 'Jordan Avery' }]),
    listLeaveTypes: jest.fn().mockResolvedValue(TYPES),
    getBalance: jest.fn().mockResolvedValue({ balances: { annual: 15, sick: 10 } }),
    listRequests: jest.fn().mockResolvedValue([]),
    createRequest: jest.fn().mockResolvedValue(row({ days: 5, end: '2026-12-26' })),
    cancelRequest: jest.fn().mockResolvedValue({ status: 'cancelled' }),
    ...overrides,
  };
}

async function start(api) {
  const { initTimeOffRequestsApp } = require('../public/js/time-off-requests');
  await initTimeOffRequestsApp(document, api);
}

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC1: submitting the new request form creates a pending request for the signed-in employee', async () => {
  const api = makeApi();
  await start(api);
  $('new-request-btn').click();
  $('leavetype-select').value = 'annual';
  $('start-date').value = '2026-12-22';
  $('end-date').value = '2026-12-26';
  $('end-date').dispatchEvent(new Event('change'));
  expect($('days-preview').textContent).toContain('5 days');
  expect($('balance-hint').textContent).toBe('Available balance: 15 days');
  $('submit-btn').click();
  await flush();
  expect(api.createRequest).toHaveBeenCalledWith('emp_1', { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' });
  expect(document.querySelector('#success-view .status-chip--pending')).not.toBeNull();
});

test('end date before start date disables Submit with an inline error', async () => {
  await start(makeApi());
  $('new-request-btn').click();
  $('start-date').value = '2026-12-24';
  $('end-date').value = '2026-12-22';
  $('end-date').dispatchEvent(new Event('change'));
  expect($('submit-btn').disabled).toBe(true);
  expect(document.querySelector('.inline-error')).not.toBeNull();
});

test('AC2: cancelling a pending request shows the unchanged-balance consequence', async () => {
  const api = makeApi({ listRequests: jest.fn().mockResolvedValue([row()]) });
  await start(api);
  document.querySelector('[data-cancel-id="TOR-1"]').click();
  expect($('cancel-consequence').textContent).toMatch(/won't change/i);
  $('confirm-cancel-btn').click();
  await flush();
  expect(api.cancelRequest).toHaveBeenCalledWith('TOR-1');
  expect(document.querySelector('.status-chip--cancelled')).not.toBeNull();
  expect(document.querySelector('[data-cancel-id="TOR-1"]')).toBeNull();
});

test('AC3: cancelling an approved request names the days to be restored', async () => {
  const api = makeApi({ listRequests: jest.fn().mockResolvedValue([row({ status: 'approved', days: 1, consumedDays: 1, end: '2026-12-22' })]) });
  await start(api);
  document.querySelector('[data-cancel-id="TOR-1"]').click();
  expect($('cancel-consequence').textContent).toMatch(/restore 1 day/i);
});

test('AC4: a rendered row shows leave type, date range and status', async () => {
  const api = makeApi({ listRequests: jest.fn().mockResolvedValue([row()]) });
  await start(api);
  const tr = document.querySelector('table.requests-table tbody tr');
  expect(tr.textContent).toContain('Annual leave');
  expect(tr.textContent).toContain('12/22/2026 – 12/23/2026');
  expect(tr.querySelector('.status-chip--pending')).not.toBeNull();
});

test('AC4: switching to HR / Manager re-fetches and adds an Employee column without a request button', async () => {
  const api = makeApi({ listRequests: jest.fn().mockResolvedValue([row()]) });
  await start(api);
  $('viewer-select').value = 'hrmanager';
  $('viewer-select').dispatchEvent(new Event('change'));
  await flush();
  expect(api.listRequests).toHaveBeenCalledTimes(2);
  expect(document.querySelector('table.requests-table thead').textContent).toContain('Employee');
  expect(document.querySelector('table.requests-table tbody').textContent).toContain('Jordan Avery');
  expect($('new-request-btn').hidden).toBe(true);
});

test('both open decisions are shown as a banner and no on-behalf employee field exists', async () => {
  await start(makeApi());
  expect(document.querySelectorAll('.decision-item')).toHaveLength(2);
  expect($('employee-select')).toBeNull();
  expect(document.querySelector('.flag-chip')).toBeNull();
});

test('a failed balance lookup does not block the requests list', async () => {
  const api = makeApi({
    getBalance: jest.fn().mockRejectedValue({ status: 404 }),
    listRequests: jest.fn().mockResolvedValue([row()]),
  });
  await start(api);
  expect(document.querySelector('table.requests-table')).not.toBeNull();
});
