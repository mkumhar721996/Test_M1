/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'leave-lookup.html');
const TYPES = [
  { id: 'annual', name: 'Annual leave' },
  { id: 'sick', name: 'Sick leave' },
  { id: 'unpaid', name: 'Unpaid leave' },
];
const EMP = { id: 'emp_1', name: 'Jordan Reyes' };

function makeApi(getBalances) {
  return { listEmployees: jest.fn().mockResolvedValue([EMP]), listTypes: jest.fn().mockResolvedValue(TYPES), getBalances };
}

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC3: shows "No starting balance yet" when the employee has no balance', async () => {
  const { initLeaveLookupApp } = require('../public/js/leave-lookup');
  await initLeaveLookupApp(document, makeApi(jest.fn().mockRejectedValue({ status: 404 })));
  expect(document.querySelector('.empty-state h3').textContent).toBe('No starting balance yet');
});

test('AC4: renders one amount per leave type for the selected employee', async () => {
  const record = { balances: { annual: 15, sick: 10, unpaid: 5 }, setAt: '2026-09-20T00:00:00.000Z' };
  const { initLeaveLookupApp } = require('../public/js/leave-lookup');
  await initLeaveLookupApp(document, makeApi(jest.fn().mockResolvedValue(record)));
  const amounts = Array.from(document.querySelectorAll('.lookup-item .type-amount')).map((e) => e.textContent);
  expect(amounts).toEqual(['15 days', '10 days', '5 days']);
  expect(document.querySelector('.lookup-meta').textContent).toContain('09/20/2026');
});

test('shows an error state when the balance lookup fails', async () => {
  const { initLeaveLookupApp } = require('../public/js/leave-lookup');
  await initLeaveLookupApp(document, makeApi(jest.fn().mockRejectedValue({ status: 500 })));
  expect(document.querySelector('.error-state')).not.toBeNull();
});

test('accessibility: the results region announces changes to screen readers', async () => {
  expect(document.getElementById('lookup-region').getAttribute('role')).toBe('status');
  expect(document.getElementById('lookup-region').getAttribute('aria-live')).toBe('polite');
  const { initLeaveLookupApp } = require('../public/js/leave-lookup');
  await initLeaveLookupApp(document, makeApi(jest.fn().mockRejectedValue({ status: 500 })));
  expect(document.querySelector('.error-state').getAttribute('role')).toBe('alert');
});

describe('createLeaveLookupApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('sends the x-staff-role header from the role switcher on every request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ([]) });
    const { createLeaveLookupApi } = require('../public/js/leave-lookup');
    const api = createLeaveLookupApi(() => 'manager');
    await api.listEmployees();
    expect(global.fetch).toHaveBeenCalledWith(
      '/employees',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'manager' }) }),
    );
  });
});
