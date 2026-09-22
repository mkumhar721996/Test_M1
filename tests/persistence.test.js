import { test, expect } from 'vitest';
import { initApp } from '../src/main.js';
import { STORAGE_KEY } from '../src/storage.js';

test('re-initializing against the same localStorage reproduces the same order', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([
    { amount: 1, date: '2026-09-10', category: 'Transport', description: 'A' },
    { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'B' },
  ]));
  document.body.innerHTML = '<div id="app"></div>';
  const app = document.getElementById('app');
  initApp(app);
  const first = [...app.querySelectorAll('.expense-description')].map(n => n.textContent);
  app.innerHTML = '';
  initApp(app);
  const second = [...app.querySelectorAll('.expense-description')].map(n => n.textContent);
  expect(second).toEqual(first);
  expect(first).toHaveLength(2);
});
