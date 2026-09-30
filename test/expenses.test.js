/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

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
    expect(document.getElementById('field-category').value).toBe('Travel');
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
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$512.50');
  });

  test('the table reflects every updated field (date, category, description, amount) immediately after saving', () => {
    document.querySelector('[data-edit-id="exp_002"]').click();
    document.getElementById('field-amount').value = '120.00';
    document.getElementById('field-date').value = '2026-09-20';
    document.getElementById('field-category').value = 'Software';
    document.getElementById('field-description').value = 'Updated description';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
    expect(row.children[0].textContent).toBe('09/20/2026');
    expect(row.querySelector('.chip').textContent).toBe('Software');
    expect(row.querySelector('.desc-cell').textContent).toBe('Updated description');
    expect(row.querySelector('.col-amount').textContent).toBe('$120.00');
  });

  test('a successful save shows a success toast', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toBe('Expense updated');
  });

  test('submitting with both Amount and Category invalid shows an inline error for each, leaving the valid Date field alone', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '';
    document.getElementById('field-category').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-amount').hidden).toBe(false);
    expect(document.getElementById('error-category').hidden).toBe(false);
    expect(document.getElementById('error-date').hidden).toBe(true);
  });

  test('submitting with an invalid field does not update the stored or rendered expense', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
  });

  test('the close (X) button discards in-progress edits, same as Cancel', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('modal-close-btn').click();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('an edited expense still shows its updated values after the page is reloaded', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);

    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    jest.resetModules();
    const { initExpensesApp: reInit } = require('../public/js/expenses');
    reInit(document);

    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$512.50');
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
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
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
    const row = document.querySelector('[data-edit-id="exp_003"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$9.00');
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

  test('clearing Description and submitting shows an inline error and does not update the stored record', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-description').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    expect(document.getElementById('error-description').hidden).toBe(false);
    expect(document.getElementById('error-description').textContent).toMatch(/Description is required/);
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').description).toBe('Flight to Chicago client site');
  });

  test('opening the edit modal for an expense logged by someone else shows the "Not logged by you" badge, and saving still succeeds', () => {
    document.getElementById('viewer-select').value = 'Morgan Ellis';
    document.querySelector('[data-edit-id="exp_002"]').click();
    expect(document.getElementById('not-yours-badge').hidden).toBe(false);
    document.getElementById('field-amount').value = '150.00';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_002').amount).toBe(150);
  });

  test('opening the edit modal for an expense logged by the current viewer keeps the "Not logged by you" badge hidden', () => {
    document.getElementById('viewer-select').value = 'Morgan Ellis';
    document.querySelector('[data-edit-id="exp_001"]').click();
    expect(document.getElementById('not-yours-badge').hidden).toBe(true);
  });

  test('opening the edit modal for an expense logged more than 90 days ago shows the "Logged a while ago" badge and an age flag on its Edit button, and saving still succeeds', () => {
    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('expenses', JSON.stringify([
      { id: 'exp_old', date: oldDate, category: 'Software', description: 'Vendor contract renewal', amount: 1080, loggedBy: 'Devon Ruiz' },
    ]));
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp: reInit } = require('../public/js/expenses');
    reInit(document);

    expect(document.querySelector('[data-edit-id="exp_old"] .age-flag')).not.toBeNull();
    document.querySelector('[data-edit-id="exp_old"]').click();
    expect(document.getElementById('old-badge').hidden).toBe(false);
    document.getElementById('field-amount').value = '1140.00';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_old').amount).toBe(1140);
  });

  test('the record context bar shows who logged the record and when', () => {
    document.querySelector('[data-edit-id="exp_002"]').click();
    expect(document.getElementById('context-logged-by').textContent).toBe('Priya Shah');
    expect(document.getElementById('context-logged-date').textContent).toBe('09/05/2026');
  });

  test('the expense list page states both edit permissions and the required-description rule', () => {
    expect(document.querySelector('.edit-hint').textContent).toMatch(/edit any expense/i);
    expect(document.querySelector('.edit-hint').textContent).toMatch(/Description is required/i);
  });
});
