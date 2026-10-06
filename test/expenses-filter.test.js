/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

const $ = (id) => document.getElementById(id);
const descriptions = () =>
  Array.from(document.querySelectorAll('#expense-tbody .desc-cell')).map((td) => td.textContent);
const dates = () =>
  Array.from(document.querySelectorAll('#expense-tbody tr')).map((tr) => tr.children[0].textContent);
const apply = ({ category = '', start = '', end = '' } = {}) => {
  $('filter-category').value = category;
  $('filter-start-date').value = start;
  $('filter-end-date').value = end;
  $('apply-filters-btn').click();
};

describe('Shared expense list with category and date filtering', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('AC1: every expense is visible regardless of which identity is signed in', () => {
    const countFor = (name) => {
      $('viewer-select').value = name;
      $('viewer-select').dispatchEvent(new Event('change'));
      return document.querySelectorAll('#expense-tbody tr').length;
    };
    expect(countFor('Morgan Ellis')).toBe(3);
    expect(countFor('Priya Shah')).toBe(3);
    expect(countFor('Devon Ruiz')).toBe(3);
  });

  test('AC2: applying category + date range together shows only rows matching both', () => {
    apply({ category: 'Travel', start: '2026-09-01', end: '2026-09-03' });
    jest.advanceTimersByTime(300);
    expect(descriptions()).toEqual(['Flight to Chicago client site']);
  });

  test('AC2: changing a control without applying does not filter the list', () => {
    $('filter-category').value = 'Software';
    $('filter-category').dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(3);
  });

  test('AC2: applied filters are summarised in chips and the result summary', () => {
    apply({ category: 'Software' });
    jest.advanceTimersByTime(300);
    expect($('active-filter-chips').hidden).toBe(false);
    expect($('active-filter-chips').textContent).toMatch(/Category: Software/);
    expect($('result-summary').textContent).toBe(
      'Showing 1 of 3 expenses matching the applied filters, sorted by date (newest first).'
    );
  });

  test('AC3: Clear filters restores the full unfiltered list', () => {
    apply({ category: 'Software' });
    jest.advanceTimersByTime(300);
    $('clear-filters-btn').click();
    expect(dates()).toEqual(['09/10/2026', '09/05/2026', '09/02/2026']);
    expect($('filter-category').value).toBe('');
    expect($('active-filter-chips').hidden).toBe(true);
    expect($('result-summary').textContent).toBe('Showing all 3 expenses, sorted by date (newest first).');
  });

  test('AC4: a non-matching filter combination shows a distinct "no match" callout', () => {
    apply({ category: 'Office Supplies' });
    jest.advanceTimersByTime(300);
    const noMatch = document.querySelector('.no-match-state');
    expect(noMatch).not.toBeNull();
    expect(noMatch.querySelector('.no-match-title').textContent).toBe('No expenses match these filters');
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(1);
  });

  test('AC4: the callout Clear filters button restores the list', () => {
    apply({ category: 'Office Supplies' });
    jest.advanceTimersByTime(300);
    document.querySelector('.no-match-state button').click();
    expect(document.querySelector('.no-match-state')).toBeNull();
    expect(dates().length).toBe(3);
  });

  test('AC5: sortByDateDesc orders by date descending regardless of input order', () => {
    const { sortByDateDesc } = require('../public/js/expenses');
    const input = [
      { id: 'a', date: '2026-09-02' },
      { id: 'b', date: '2026-09-10' },
      { id: 'c', date: '2026-09-05' },
    ];
    expect(sortByDateDesc(input).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('AC5: the unfiltered list on load is rendered most-recent-first', () => {
    expect(dates()).toEqual(['09/10/2026', '09/05/2026', '09/02/2026']);
  });

  test('AC6: boundary-dated rows are included in an applied date range', () => {
    apply({ start: '2026-09-02', end: '2026-09-10' });
    jest.advanceTimersByTime(300);
    expect(descriptions()).toEqual(
      expect.arrayContaining(['Flight to Chicago client site', 'Figma seat renewal'])
    );
    expect(descriptions().length).toBe(3);
  });

  test('AC7: each row shows the identity that logged it in a visible "Logged by" field', () => {
    expect(document.querySelector('.expense-table thead th:nth-child(4)').textContent).toBe('Logged by');
    const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
    expect(row.querySelector('.logged-by-cell').textContent).toBe('Priya Shah');
  });

  test('AC8: no delete control is presented anywhere on the list', () => {
    const buttons = Array.from(document.querySelectorAll('button'));
    expect(buttons.some((b) => /delete/i.test(b.textContent) || /delete/i.test(b.id))).toBe(false);
  });

  test('AC9: From after To is blocked with an inline validation error', () => {
    apply({ start: '2026-09-27', end: '2026-09-15' });
    const error = $('error-date-range');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/From.*on or before.*To/i);
  });

  test('AC10: a blocked invalid-range attempt leaves the previously shown list unchanged', () => {
    apply({ category: 'Software' });
    jest.advanceTimersByTime(300);
    const before = descriptions();
    apply({ category: 'Travel', start: '2026-09-27', end: '2026-09-15' });
    jest.advanceTimersByTime(300);
    expect(descriptions()).toEqual(before);
    expect($('active-filter-chips').textContent).not.toMatch(/Travel/);
  });

  test('AC9: the error is cleared once a valid range is applied', () => {
    apply({ start: '2026-09-27', end: '2026-09-15' });
    apply({ start: '2026-09-01', end: '2026-09-15' });
    expect($('error-date-range').hidden).toBe(true);
  });
});
