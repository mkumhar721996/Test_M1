/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Filter Expenses by Category and Date Range', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);
  });

  test('the category dropdown and both date pickers are visible on page load with no toggle', () => {
    expect(document.getElementById('filter-category')).not.toBeNull();
    expect(document.getElementById('filter-start-date')).not.toBeNull();
    expect(document.getElementById('filter-end-date')).not.toBeNull();
    expect(document.getElementById('filter-category').closest('[hidden]')).toBeNull();
  });

  test('selecting a category immediately narrows the table to matching rows', () => {
    document.getElementById('filter-category').value = 'Software';
    document.getElementById('filter-category').dispatchEvent(new Event('change'));
    const rows = document.querySelectorAll('#expense-tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.desc-cell').textContent).toBe('Figma seat renewal');
    expect(document.getElementById('result-count').textContent).toMatch(/1 of 3/);
  });

  test('setting a start and end date immediately narrows the table to expenses within range', () => {
    document.getElementById('filter-start-date').value = '2026-09-03';
    document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
    document.getElementById('filter-end-date').value = '2026-09-09';
    document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
    const rows = document.querySelectorAll('#expense-tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.desc-cell').textContent).toBe('Team lunch — Q3 kickoff');
  });

  test('combining a category and a date range only shows expenses matching both', () => {
    document.getElementById('filter-category').value = 'Travel';
    document.getElementById('filter-category').dispatchEvent(new Event('change'));
    document.getElementById('filter-start-date').value = '2026-09-01';
    document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
    document.getElementById('filter-end-date').value = '2026-09-03';
    document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
    const rows = document.querySelectorAll('#expense-tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.desc-cell').textContent).toBe('Flight to Chicago client site');
  });

  test('filters matching nothing show a distinct "No matching expenses" message', () => {
    document.getElementById('filter-category').value = 'Other';
    document.getElementById('filter-category').dispatchEvent(new Event('change'));
    const noMatchRow = document.querySelector('.no-match-row');
    expect(noMatchRow).not.toBeNull();
    expect(noMatchRow.querySelector('.no-match-title').textContent).toBe('No matching expenses');
    expect(document.querySelector('.empty-row')).toBeNull();
  });

  test('clearing all filter controls restores the full unfiltered expense list', () => {
    document.getElementById('filter-category').value = 'Software';
    document.getElementById('filter-category').dispatchEvent(new Event('change'));
    document.getElementById('clear-filters-btn').click();
    expect(document.getElementById('filter-category').value).toBe('');
    expect(document.getElementById('filter-start-date').value).toBe('');
    expect(document.getElementById('filter-end-date').value).toBe('');
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(3);
  });

  test('the category dropdown lists the fixed application category set regardless of current data', () => {
    const { CATEGORIES } = require('../public/js/expenses');
    const options = Array.from(document.querySelectorAll('#filter-category option'))
      .map((o) => o.value)
      .filter((v) => v !== '');
    expect(options).toEqual(CATEGORIES);
  });

  test('every filter control is a native, non-disabled element reachable by Tab', () => {
    ['filter-category', 'filter-start-date', 'filter-end-date', 'clear-filters-btn'].forEach((id) => {
      const el = document.getElementById(id);
      expect(el.disabled).toBe(false);
      expect(el.tabIndex).not.toBe(-1);
    });
  });

  test('every filter control has an associated accessible label', () => {
    expect(document.querySelector('label[for="filter-category"]')).not.toBeNull();
    expect(document.querySelector('label[for="filter-start-date"]')).not.toBeNull();
    expect(document.querySelector('label[for="filter-end-date"]')).not.toBeNull();
    expect(document.getElementById('filter-category').getAttribute('aria-label')).toBe('Category');
    expect(document.getElementById('filter-start-date').getAttribute('aria-label')).toBe('Start date');
    expect(document.getElementById('filter-end-date').getAttribute('aria-label')).toBe('End date');
  });

  test('filterExpenses is a pure function that AND-combines category and date-range conditions', () => {
    const { filterExpenses } = require('../public/js/expenses');
    const list = [
      { date: '2026-09-01', category: 'Travel', description: 'A' },
      { date: '2026-09-05', category: 'Meals', description: 'B' },
    ];
    expect(filterExpenses(list, { category: 'Travel' })).toEqual([list[0]]);
    expect(filterExpenses(list, { start: '2026-09-02' })).toEqual([list[1]]);
    expect(filterExpenses(list, {})).toEqual(list);
  });
});
