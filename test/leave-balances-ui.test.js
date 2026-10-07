/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'leave-balances.html');
const $ = (id) => document.getElementById(id);
const submit = () => $('balances-form').dispatchEvent(new Event('submit', { cancelable: true }));
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
const pressKey = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));

const EMP = { id: 'emp_1', name: 'Priya Shah', jobTitle: 'People Ops' };
const TYPES = [
  { id: 'annual', name: 'Annual leave', defaultBalance: 15 },
  { id: 'sick', name: 'Sick leave', defaultBalance: 10 },
  { id: 'unpaid', name: 'Unpaid leave', defaultBalance: 5 },
];

function makeApi(overrides = {}) {
  return {
    listEmployees: jest.fn().mockResolvedValue([EMP]),
    listTypes: jest.fn().mockResolvedValue(TYPES),
    listBalances: jest.fn().mockResolvedValue([]),
    saveBalances: jest.fn().mockResolvedValue({ employeeId: 'emp_1', balances: { annual: 15, sick: 10, unpaid: 5 }, created: true }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC2: submitting the set form calls saveBalances with all three values', async () => {
  const api = makeApi();
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  document.querySelector('[data-set-balances-id="emp_1"]').click();
  $('field-annual').value = '15';
  $('field-sick').value = '10';
  $('field-unpaid').value = '5';
  submit();
  await flush();
  expect(api.saveBalances).toHaveBeenCalledWith('emp_1', { annual: 15, sick: 10, unpaid: 5 });
  expect(document.querySelectorAll('.bal-chip')).toHaveLength(3);
  expect($('toast').textContent).toBe('Starting balances set for Priya Shah.');
  expect($('modal-wrap').hidden).toBe(true);
});

test('AC2: zero is accepted as a balance', async () => {
  const api = makeApi({
    saveBalances: jest.fn((id, values) => Promise.resolve({ employeeId: id, balances: values, created: true })),
  });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  document.querySelector('[data-set-balances-id="emp_1"]').click();
  $('field-unpaid').value = '0';
  submit();
  await flush();
  expect(api.saveBalances).toHaveBeenCalledWith('emp_1', { annual: 15, sick: 10, unpaid: 0 });
  const amounts = Array.from(document.querySelectorAll('.bal-amount')).map((e) => e.textContent);
  expect(amounts).toEqual(['15', '10', '0']);
});

test('AC2: a negative entry blocks save, shows an inline error, and moves focus to the invalid field', async () => {
  const api = makeApi();
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  document.querySelector('[data-set-balances-id="emp_1"]').click();
  $('field-annual').value = '-1';
  submit();
  expect($('error-annual').hidden).toBe(false);
  expect(api.saveBalances).not.toHaveBeenCalled();
  expect(document.activeElement).toBe($('field-annual'));
});

test('an already-set employee gets Adjust, pre-filled, with the updated toast', async () => {
  const record = { employeeId: 'emp_1', balances: { annual: 20, sick: 10, unpaid: 5 }, created: false };
  const api = makeApi({ listBalances: jest.fn().mockResolvedValue([record]) });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  document.querySelector('[data-adjust-balances-id="emp_1"]').click();
  expect($('field-annual').value).toBe('20');
  submit();
  await flush();
  expect($('toast').textContent).toBe('Starting balances updated for Priya Shah.');
});

test('shows an error state with Try again when employees fail to load', async () => {
  const api = makeApi({ listEmployees: jest.fn().mockRejectedValue({ status: 500 }) });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  expect($('retry-btn')).not.toBeNull();
});

test('shows an error state, not default balances, when the batched balance lookup fails', async () => {
  const api = makeApi({ listBalances: jest.fn().mockRejectedValue({ status: 500 }) });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  expect($('retry-btn')).not.toBeNull();
  expect(document.querySelector('[data-set-balances-id="emp_1"]')).toBeNull();
});

test('performance: load() fetches all balances in a single batched request regardless of employee count', async () => {
  const manyEmployees = Array.from({ length: 5 }, (_, i) => ({ id: `emp_${i}`, name: `Employee ${i}`, jobTitle: 'Eng' }));
  const api = makeApi({ listEmployees: jest.fn().mockResolvedValue(manyEmployees) });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  expect(api.listBalances).toHaveBeenCalledTimes(1);
});

describe('accessibility: modal focus management', () => {
  test('tabbing past the last focusable element wraps to the first (focus trap)', async () => {
    const api = makeApi();
    const { initLeaveBalancesApp } = require('../public/js/leave-balances');
    await initLeaveBalancesApp(document, api);
    document.querySelector('[data-set-balances-id="emp_1"]').click();
    $('save-balances-btn').focus();
    pressKey('Tab');
    expect(document.activeElement.id).toBe('modal-close-btn');
  });

  test('shift+tabbing past the first focusable element wraps to the last (focus trap)', async () => {
    const api = makeApi();
    const { initLeaveBalancesApp } = require('../public/js/leave-balances');
    await initLeaveBalancesApp(document, api);
    document.querySelector('[data-set-balances-id="emp_1"]').click();
    $('modal-close-btn').focus();
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement.id).toBe('save-balances-btn');
  });

  test('closing via Cancel returns focus to the trigger button', async () => {
    const api = makeApi();
    const { initLeaveBalancesApp } = require('../public/js/leave-balances');
    await initLeaveBalancesApp(document, api);
    const trigger = document.querySelector('[data-set-balances-id="emp_1"]');
    trigger.focus();
    trigger.click();
    $('modal-cancel-btn').click();
    expect(document.activeElement).toBe(trigger);
  });

  test('closing via Escape returns focus to the trigger button', async () => {
    const api = makeApi();
    const { initLeaveBalancesApp } = require('../public/js/leave-balances');
    await initLeaveBalancesApp(document, api);
    const trigger = document.querySelector('[data-set-balances-id="emp_1"]');
    trigger.focus();
    trigger.click();
    pressKey('Escape');
    expect(document.activeElement).toBe(trigger);
  });

  test('saving returns focus to the re-rendered trigger button, now labelled Adjust balances', async () => {
    const api = makeApi({
      saveBalances: jest.fn((id, values) => Promise.resolve({ employeeId: id, balances: values, created: true })),
    });
    const { initLeaveBalancesApp } = require('../public/js/leave-balances');
    await initLeaveBalancesApp(document, api);
    document.querySelector('[data-set-balances-id="emp_1"]').click();
    $('field-annual').value = '15';
    $('field-sick').value = '10';
    $('field-unpaid').value = '5';
    submit();
    await flush();
    const newTrigger = document.querySelector('[data-adjust-balances-id="emp_1"]');
    expect(newTrigger).not.toBeNull();
    expect(document.activeElement).toBe(newTrigger);
  });
});

describe('createLeaveBalancesApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('sends the x-staff-role header from the role switcher on every request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ([]) });
    const { createLeaveBalancesApi } = require('../public/js/leave-balances');
    const api = createLeaveBalancesApi(() => 'hr');
    await api.listEmployees();
    expect(global.fetch).toHaveBeenCalledWith(
      '/employees',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'hr' }) }),
    );
  });
});
