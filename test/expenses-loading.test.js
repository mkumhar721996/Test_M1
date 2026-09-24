/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC5: skeleton/loading caption is shown before the fetch resolves, and the fetch (not localStorage) populates the table', () => {
  localStorage.setItem('expenses', JSON.stringify([
    { id: 'exp_999', date: '2026-01-01', category: 'Other', description: 'should never appear', amount: 1 },
  ]));
  const api = { listExpenses: () => new Promise(() => {}) };
  const { initExpensesApp } = require('../public/js/expenses');
  initExpensesApp(document, api);

  expect(document.getElementById('expenses-loading-caption').hidden).toBe(false);
  expect(document.getElementById('expense-table').getAttribute('aria-busy')).toBe('true');
  expect(document.body.textContent).not.toMatch(/should never appear/);
});

test('AC3/AC4: a failed initial load shows the error state and toast, never a localStorage fallback', async () => {
  localStorage.setItem('expenses', JSON.stringify([
    { id: 'exp_999', date: '2026-01-01', category: 'Other', description: 'should never appear', amount: 1 },
  ]));
  const api = { listExpenses: () => Promise.reject({ status: 500 }) };
  const { initExpensesApp } = require('../public/js/expenses');
  initExpensesApp(document, api);

  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('expenses-error-state').hidden).toBe(false);
  expect(document.getElementById('expenses-table-scroll').hidden).toBe(true);
  expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t load expenses — server error \(500\)/);
  expect(document.body.textContent).not.toMatch(/should never appear/);
});

test('a successful load hides the loading caption and error state, and shows the fetched rows', async () => {
  const api = {
    listExpenses: () => Promise.resolve([
      { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
    ]),
  };
  const { initExpensesApp } = require('../public/js/expenses');
  initExpensesApp(document, api);

  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('expenses-loading-caption').hidden).toBe(true);
  expect(document.getElementById('expenses-error-state').hidden).toBe(true);
  expect(document.getElementById('expense-table').getAttribute('aria-busy')).toBeNull();
  expect(document.querySelector('.desc-cell').textContent).toBe('Flight to Chicago client site');
});

test('the "Try again" button in the error state re-runs the load', async () => {
  let callCount = 0;
  const api = {
    listExpenses: () => {
      callCount += 1;
      return callCount === 1 ? Promise.reject({ status: 500 }) : Promise.resolve([]);
    },
  };
  const { initExpensesApp } = require('../public/js/expenses');
  initExpensesApp(document, api);
  await Promise.resolve();
  await Promise.resolve();
  expect(document.getElementById('expenses-error-state').hidden).toBe(false);

  document.getElementById('expenses-error-retry-btn').click();
  await Promise.resolve();
  await Promise.resolve();

  expect(document.getElementById('expenses-error-state').hidden).toBe(true);
  expect(callCount).toBe(2);
});
