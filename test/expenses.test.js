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

  test('submitting with all required fields valid closes the modal', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('a valid submit persists the updated record to localStorage', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.find((e) => e.id === 'exp_001').amount).toBe(512.5);
  });

  test('the list row shows the updated amount immediately after saving', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    await Promise.resolve();
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

  test('the saved row displays the amount as USD with two decimals', async () => {
    document.querySelector('[data-edit-id="exp_003"]').click();
    document.getElementById('field-amount').value = '9';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    await Promise.resolve();
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

  test('a localStorage failure on save keeps the modal open, re-enables the save button, and shows an error toast', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    await Promise.resolve();

    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    const saveBtn = document.getElementById('modal-save-btn');
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe('Save changes');
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/could not be saved/i);

    setItemSpy.mockRestore();
  });
});
