/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Expense List View with Empty State', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('all expenses in localStorage are rendered with date, category, description, and amount cells', () => {
    localStorage.setItem('expenses', JSON.stringify([
      { id: 'exp_101', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15 },
      { id: 'exp_102', date: '2026-09-18', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.5 },
    ]));
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);

    expect(document.getElementById('expense-table-wrap').hidden).toBe(false);
    expect(document.getElementById('expense-empty-state').hidden).toBe(true);
    const rows = document.querySelectorAll('#expense-tbody tr');
    expect(rows.length).toBe(2);
    const softwareRow = Array.from(rows).find((r) => r.querySelector('.chip').textContent === 'Software');
    expect(softwareRow.querySelector('.desc-cell').textContent).toBe('Figma seat renewal');
    expect(softwareRow.querySelector('.col-amount').textContent).toBe('$15.00');
  });

  test('loadExpenses returns an empty array and writes nothing when localStorage is empty', () => {
    const { loadExpenses, STORAGE_KEY } = require('../public/js/expenses');
    expect(loadExpenses()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('with no expenses in localStorage, the guided empty state replaces the table', () => {
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);

    expect(document.getElementById('expense-table-wrap').hidden).toBe(true);
    expect(document.getElementById('expense-empty-state').hidden).toBe(false);
    expect(document.querySelector('.empty-state-title').textContent).toBe('No expenses yet');
    expect(document.querySelector('.empty-state-body').textContent).toMatch(/add your first expense/i);
  });

  test('clicking "+ Add your first expense" in the empty state opens the create-expense modal', () => {
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);

    document.getElementById('empty-add-expense-btn').click();
    expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
  });
});
