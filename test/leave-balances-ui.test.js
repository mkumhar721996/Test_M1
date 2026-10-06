/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'leave-balances.html');
const $ = (id) => document.getElementById(id);
const submit = () => $('balances-form').dispatchEvent(new Event('submit', { cancelable: true }));
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

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
    getBalances: jest.fn().mockRejectedValue({ status: 404 }),
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

test('AC2: a negative entry blocks save with an inline error and no API call', async () => {
  const api = makeApi();
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  document.querySelector('[data-set-balances-id="emp_1"]').click();
  $('field-annual').value = '-1';
  submit();
  expect($('error-annual').hidden).toBe(false);
  expect(api.saveBalances).not.toHaveBeenCalled();
});

test('an already-set employee gets Adjust, pre-filled, with the updated toast', async () => {
  const record = { employeeId: 'emp_1', balances: { annual: 20, sick: 10, unpaid: 5 }, created: false };
  const api = makeApi({ getBalances: jest.fn().mockResolvedValue(record) });
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

test('shows an error state, not default balances, when a balance lookup fails with a non-404 error', async () => {
  const api = makeApi({ getBalances: jest.fn().mockRejectedValue({ status: 500 }) });
  const { initLeaveBalancesApp } = require('../public/js/leave-balances');
  await initLeaveBalancesApp(document, api);
  expect($('retry-btn')).not.toBeNull();
  expect(document.querySelector('[data-set-balances-id="emp_1"]')).toBeNull();
});
