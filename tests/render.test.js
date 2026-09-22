import { test, expect } from 'vitest';
import { renderExpenseList } from '../src/render.js';

test('shows the empty state with a prompt to add the first expense', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), []);
  expect(document.querySelector('.empty-state-title').textContent).toBe('No expenses yet');
  expect(document.querySelector('#empty-add-first-btn').textContent)
    .toContain('Add your first expense');
});

test('renders amount, date, category, and description for a saved expense', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), [
    { amount: 128.4, date: '2026-09-17', category: 'Utilities', description: 'Monthly electricity bill' },
  ]);
  const row = document.querySelector('.expense-row');
  expect(row.querySelector('.expense-amount').textContent).toContain('$128.40');
  expect(row.querySelector('time').textContent).toBe('Sep 17, 2026');
  expect(row.querySelector('.chip').textContent).toContain('Utilities');
  expect(row.querySelector('.expense-description').textContent).toContain('Monthly electricity bill');
});

test('renders rows in the order the expenses array is given, without re-sorting', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), [
    { amount: 1, date: '2026-09-10', category: 'Transport', description: 'first-in-array' },
    { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'second-in-array' },
  ]);
  const descriptions = [...document.querySelectorAll('.expense-description')].map(n => n.textContent);
  expect(descriptions[0]).toContain('first-in-array');
  expect(descriptions[1]).toContain('second-in-array');
});

test('exposes amount, date, category, and description as accessible text per row', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), [
    { amount: 9, date: '2026-09-14', category: 'Transport', description: 'Metro card top-up' },
  ]);
  const row = document.querySelector('.expense-row');
  expect(row.textContent).toContain('Amount:');
  expect(row.textContent).toContain('Category:');
  expect(row.textContent).toContain('Date:');
  expect(row.textContent).toContain('Description:');
});

test('escapes user-entered category and description to avoid HTML injection', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), [
    { amount: 1, date: '2026-09-10', category: '<b>x</b>', description: '<img src=x onerror=alert(1)>' },
  ]);
  expect(document.querySelector('.expense-row').querySelector('img')).toBeNull();
  expect(document.querySelector('.expense-description').textContent).toContain('<img src=x onerror=alert(1)>');
});

test('escapes a malicious date value to prevent attribute injection', () => {
  document.body.innerHTML = '<div id="app"></div>';
  renderExpenseList(document.getElementById('app'), [
    { amount: 1, date: '2026-09-17" onclick="alert(1)', category: 'Transport', description: 'x' },
  ]);
  const time = document.querySelector('time');
  expect(time.hasAttribute('onclick')).toBe(false);
});
