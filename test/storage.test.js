/** @jest-environment jsdom */
const { STORAGE_KEY, loadExpenses, saveExpenses } = require('../public/storage');

beforeEach(() => localStorage.clear());

test('returns an empty array when nothing is stored', () => {
  expect(loadExpenses()).toEqual([]);
});

test('returns an empty array when stored data is not valid JSON', () => {
  localStorage.setItem(STORAGE_KEY, 'not-json');
  expect(loadExpenses()).toEqual([]);
});

test('returns an empty array when stored data is not an array', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
  expect(loadExpenses()).toEqual([]);
});

test('round-trips a saved list of expenses', () => {
  const expenses = [
    { amount: 20, date: '2026-09-02', category: 'Transport', description: 'newest' },
    { amount: 10, date: '2026-09-01', category: 'Other', description: 'oldest' },
  ];
  saveExpenses(expenses);
  expect(loadExpenses()).toEqual(expenses);
});
