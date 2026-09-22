import { test, expect, beforeEach } from 'vitest';
import { loadExpenses, STORAGE_KEY } from '../src/storage.js';

beforeEach(() => localStorage.clear());

test('returns an empty array when nothing is stored', () => {
  expect(loadExpenses()).toEqual([]);
});

test('returns an empty array when stored data is not valid JSON', () => {
  localStorage.setItem(STORAGE_KEY, 'not-json');
  expect(loadExpenses()).toEqual([]);
});

test('returns the stored array preserving order when no addedAt is present', () => {
  const expenses = [
    { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'B' },
    { amount: 1, date: '2026-09-10', category: 'Transport', description: 'A' },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  expect(loadExpenses()).toEqual(expenses);
});

test('returns expenses sorted by addedAt descending regardless of storage order', () => {
  const older = { amount: 1, date: '2026-09-10', category: 'Transport', description: 'A', addedAt: 100 };
  const newer = { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'B', addedAt: 200 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([older, newer]));
  expect(loadExpenses()).toEqual([newer, older]);
});
