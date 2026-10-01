/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'user-history.html');

const ELENA = { id: 'usr_004', name: 'Elena Brooks', email: 'elena.brooks@company.com', roles: ['employee', 'finance'], status: 'deactivated', deactivatedAt: '2026-06-10T09:30:00.000Z' };

const EXPENSES = [
  { id: 'EXP-1', date: '2026-04-02', category: 'Software', description: 'Design tool license renewal', amount: 129, loggedBy: 'Elena Brooks', approvedBy: '—' },
  { id: 'EXP-2', date: '2026-05-14', category: 'Travel', description: 'Regional sales conference flights', amount: 482.1, loggedBy: 'Morgan Ellis', approvedBy: 'Elena Brooks' },
  { id: 'EXP-3', date: '2026-05-20', category: 'Meals', description: 'Unrelated lunch', amount: 20, loggedBy: 'Devon Ruiz' },
];

describe('Deactivated account expense history', () => {
  let mod;

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    mod = require('../public/js/user-history');
  });

  test('AC8: expenses logged or approved by the deactivated user are shown, others are not', () => {
    mod.initUserHistory(document, ELENA, EXPENSES);
    const rows = document.querySelectorAll('#history-tbody tr');
    expect(rows).toHaveLength(2);
    const text = document.getElementById('history-tbody').textContent;
    expect(text).toContain('Design tool license renewal');
    expect(text).toContain('Regional sales conference flights');
    expect(text).not.toContain('Unrelated lunch');
  });

  test('AC8: every row is tagged Read-only and the page has no edit or delete control', () => {
    mod.initUserHistory(document, ELENA, EXPENSES);
    document.querySelectorAll('#history-tbody tr').forEach((row) => {
      expect(row.querySelector('.readonly-tag').textContent).toBe('Read-only');
    });
    expect(document.querySelectorAll('#history-card button, #history-card input, #history-card textarea, #history-card select')).toHaveLength(0);
    expect(document.getElementById('history-tbody').textContent).not.toMatch(/edit|delete/i);
  });

  test('AC8/AC9: a deactivated account shows the Deactivated chip and the read-only banner', () => {
    mod.initUserHistory(document, ELENA, EXPENSES);
    expect(document.querySelector('#history-status .status-chip--deactivated')).not.toBeNull();
    expect(document.getElementById('history-banner').hidden).toBe(false);
    expect(document.getElementById('history-banner-text').textContent).toContain('read-only history');
    expect(document.getElementById('history-meta').textContent).toContain('elena.brooks@company.com');
  });

  test('an active account hides the deactivation banner', () => {
    mod.initUserHistory(document, { ...ELENA, status: 'active', deactivatedAt: undefined }, EXPENSES);
    expect(document.getElementById('history-banner').hidden).toBe(true);
  });

  test('an account with no expenses shows an empty message instead of rows', () => {
    mod.initUserHistory(document, { ...ELENA, name: 'Nobody Here' }, EXPENSES);
    expect(document.querySelectorAll('#history-tbody tr')).toHaveLength(1);
    expect(document.getElementById('history-tbody').textContent).toContain('No expenses were logged or approved');
  });

  test('expense text is HTML-escaped', () => {
    mod.initUserHistory(document, ELENA, [{ ...EXPENSES[0], description: '<img src=x onerror=alert(1)>' }]);
    expect(document.querySelector('#history-tbody img')).toBeNull();
  });

  test('loadExpenses reads the same localStorage key as the expenses page and tolerates bad data', () => {
    localStorage.setItem('expenses', JSON.stringify(EXPENSES));
    expect(mod.loadExpenses(localStorage)).toHaveLength(3);
    localStorage.setItem('expenses', '{not json');
    expect(mod.loadExpenses(localStorage)).toEqual([]);
    localStorage.removeItem('expenses');
    expect(mod.loadExpenses(localStorage)).toEqual([]);
  });

  test('showLoadError hides the table and shows the error state', () => {
    mod.showLoadError(document);
    expect(document.getElementById('history-card').hidden).toBe(true);
    expect(document.getElementById('history-error').hidden).toBe(false);
  });
});
