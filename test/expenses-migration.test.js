/** @jest-environment jsdom */

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
});

test('AC2: a stale localStorage expenses key is removed when the app loads', () => {
  localStorage.setItem('expenses', JSON.stringify([{ id: 'exp_001' }]));
  const { migrateLegacyExpenseStorage } = require('../public/js/expenses');
  migrateLegacyExpenseStorage(document);
  expect(localStorage.getItem('expenses')).toBeNull();
});

test('AC2 (contrast): no localStorage key present is a no-op, not an error', () => {
  const { migrateLegacyExpenseStorage } = require('../public/js/expenses');
  expect(() => migrateLegacyExpenseStorage(document)).not.toThrow();
  expect(localStorage.getItem('expenses')).toBeNull();
});
