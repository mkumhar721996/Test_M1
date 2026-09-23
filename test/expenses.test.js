/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const { fireEvent } = require('@testing-library/dom');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Edit Expense via Modal Form', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    jest.useFakeTimers();
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('activating Edit opens a modal pre-populated with the record\'s current values', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    expect(document.getElementById('field-amount').value).toBe('482.50');
    expect(document.getElementById('field-date').value).toBe('2026-09-02');
    expect(document.getElementById('field-category').value).toBe('travel');
    expect(document.getElementById('field-description').value).toBe('Flight to Chicago client site');
  });

  test('clearing Amount and submitting keeps the modal open with an inline error below it', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    expect(document.getElementById('error-amount').hidden).toBe(false);
    expect(document.getElementById('error-amount').textContent).toMatch(/Amount is required/);
  });

  test('submitting with all required fields valid closes the modal', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('a valid submit persists the updated record to localStorage', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(512.5);
  });

  test('the list row shows the updated amount immediately after saving', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('.expense-row');
    expect(row.querySelector('.expense-amount').textContent).toBe('$512.50');
  });

  test('cancelling the modal discards in-progress edits to the record', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('modal-cancel-btn').click();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
  });

  test('cancelling the modal leaves the rendered list unchanged', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('modal-cancel-btn').click();
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('.expense-row');
    expect(row.querySelector('.expense-amount').textContent).toBe('$482.50');
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('formatUSD renders a $ symbol and exactly two decimal places', () => {
    const { formatUSD } = require('../public/js/expenses');
    expect(formatUSD(512.5)).toBe('$512.50');
    expect(formatUSD(15)).toBe('$15.00');
  });

  test('the saved row displays the amount as USD with two decimals', () => {
    document.querySelector('[data-edit-id="exp_003"]').click();
    document.getElementById('field-amount').value = '9';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const row = document.querySelector('[data-edit-id="exp_003"]').closest('.expense-row');
    expect(row.querySelector('.expense-amount').textContent).toBe('$9.00');
  });

  test('cancelling while a save is in flight does not persist the change or show a success toast', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    document.getElementById('modal-cancel-btn').click();
    jest.advanceTimersByTime(350);

    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
    expect(document.getElementById('toast-message').textContent).not.toMatch(/^Expense updated$/);
  });

  test('cancelling and editing a different record before the first save completes does not cross-apply values', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    document.getElementById('modal-cancel-btn').click();

    document.querySelector('[data-edit-id="exp_002"]').click();
    document.getElementById('field-amount').value = '10.00';
    jest.advanceTimersByTime(350);

    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
    expect(document.getElementById('field-amount').value).toBe('10.00');
    expect(document.getElementById('modal-wrap').hidden).toBe(false);
  });

  test('a localStorage failure on save keeps the modal open, re-enables the save button, and shows an error toast', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);

    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    const saveBtn = document.getElementById('modal-save-btn');
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe('Save changes');
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/could not be saved/i);

    setItemSpy.mockRestore();
  });
});

describe('Category Filtering and Grouping in Expense List', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);
  });

  test('AC1: selecting a single category narrows the list to only that category\'s expenses', () => {
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    const rows = document.querySelectorAll('.expense-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Flight to Chicago client site');
  });

  test('AC2: selecting Uncategorised shows only expenses with no category assigned', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    initExpensesApp(document);

    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'uncategorised' } });
    const rows = document.querySelectorAll('.expense-row');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.chip-uncategorised')).toBeTruthy();
  });

  test('AC3: grouping renders expenses under category headings, with uncategorised distinct', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    initExpensesApp(document);

    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBeGreaterThan(1);
    const uncategorisedHeading = document.querySelector('.group-heading-uncategorised');
    expect(uncategorisedHeading.querySelector('.group-heading-name').textContent).toMatch(/Uncategorised/);
  });

  test('AC4: clearing an applied filter shows every expense again', () => {
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    fireEvent.click(document.getElementById('clear-filter-btn'));
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
    expect(document.getElementById('filter-category').value).toBe('all');
  });

  test('AC5: once a category is deleted, its expenses appear under Uncategorised', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    persistCategories(deleteCategory(loadCategories(), 'software'));
    initExpensesApp(document);
    const row = document.querySelector('[data-edit-id="exp_003"]').closest('.expense-row');
    expect(row.querySelector('.chip-uncategorised')).toBeTruthy();
  });

  test('AC6: no reference to the deleted category remains anywhere in the list', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    persistCategories(deleteCategory(loadCategories(), 'software'));
    initExpensesApp(document);

    expect(document.getElementById('filter-category').textContent).not.toMatch(/Software/);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    expect(document.querySelector('.expense-list').textContent).not.toMatch(/Software/);
  });

  test('AC7: each non-Uncategorised group heading shows a subtotal', () => {
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const travelHeading = [...document.querySelectorAll('.group-heading')].find((h) => h.textContent.includes('Travel'));
    expect(travelHeading.querySelector('.group-heading-meta').textContent).toMatch(/\$482\.50/);
  });

  test('AC8: the Uncategorised heading shows a count but no monetary subtotal', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    initExpensesApp(document);

    fireEvent.click(document.getElementById('view-grouped-btn'));
    const meta = document.querySelector('.group-heading-uncategorised .group-heading-meta').textContent;
    expect(meta).toMatch(/expense/);
    expect(meta).not.toMatch(/\$/);
  });

  test('AC9: a rename made elsewhere does not change an already-open list until further action', () => {
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    persistCategories(renameCategory(loadCategories(), 'travel', 'Trips'));
    expect(document.getElementById('filter-category').textContent).toMatch(/Travel/);
    expect(document.getElementById('filter-category').textContent).not.toMatch(/Trips/);
  });

  test('AC10: reopening the list after a rename shows the new name', () => {
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    persistCategories(renameCategory(loadCategories(), 'travel', 'Trips'));
    initExpensesApp(document);
    expect(document.getElementById('filter-category').textContent).toMatch(/Trips/);
  });

  test('edge case: a true zero-expense account shows an invitation-to-act empty state', () => {
    const { persistExpenses, initExpensesApp } = require('../public/js/expenses');
    persistExpenses([]);
    initExpensesApp(document);
    expect(document.getElementById('empty-state').textContent).toMatch(/No expenses yet/);
    expect(document.getElementById('expense-list').style.display).toBe('none');
  });

  test('edge case: filtering to a real category with zero expenses shows the filter-mismatch empty state', () => {
    const { loadCategories, persistCategories } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    persistCategories([...loadCategories(), { id: 'misc', name: 'Misc' }]);
    initExpensesApp(document);
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'misc' } });
    expect(document.getElementById('empty-state').textContent).toMatch(/No expenses match this filter/);
  });

  test('edge case: removing every category degrades grouping to a single Uncategorised group', () => {
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    const remaining = loadCategories().reduce((cats, c) => deleteCategory(cats, c.id), loadCategories());
    persistCategories(remaining);
    initExpensesApp(document);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBe(1);
    expect(headings[0].classList.contains('group-heading-uncategorised')).toBe(true);
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
  });

  test('edge case: an unusually long renamed category still appears in full in filter and heading', () => {
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    const longName = 'International Travel & Client Entertainment Reimbursements';
    persistCategories(renameCategory(loadCategories(), 'travel', longName));
    initExpensesApp(document);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    expect(document.getElementById('filter-category').textContent).toContain(longName);
    expect(document.querySelector('.group-heading-name').textContent).toContain(longName);
  });

  test('edge case: a dangling categoryId with no matching category falls back to Uncategorised', () => {
    const { loadExpenses, persistExpenses, initExpensesApp } = require('../public/js/expenses');
    const expenses = loadExpenses();
    expenses[0].categoryId = 'nonexistent-category-id';
    persistExpenses(expenses);
    initExpensesApp(document);
    const row = document.querySelector(`[data-edit-id="${expenses[0].id}"]`).closest('.expense-row');
    expect(row.querySelector('.chip-uncategorised')).toBeTruthy();
  });

  test('edge case: an active category filter combines with grouped view rather than conflicting', () => {
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toMatch(/Travel/);
  });

  test('edge case: deleting the currently-filtered category resets the filter to All categories', () => {
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'software' } });
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    persistCategories(deleteCategory(loadCategories(), 'software'));
    initExpensesApp(document);
    expect(document.getElementById('filter-category').value).toBe('all');
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
  });

  test('regression: reassignExpensesFromDeletedCategory only touches matching expenses', () => {
    const { reassignExpensesFromDeletedCategory } = require('../public/js/expenses');
    const result = reassignExpensesFromDeletedCategory(
      [{ id: 'a', categoryId: 'software' }, { id: 'b', categoryId: 'travel' }],
      'software'
    );
    expect(result.find((e) => e.id === 'a').categoryId).toBeNull();
    expect(result.find((e) => e.id === 'b').categoryId).toBe('travel');
  });
});
