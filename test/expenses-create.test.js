/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Create Expense via Modal Form', () => {
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

  test('clicking Add expense opens the create modal with every field empty', () => {
    document.getElementById('add-expense-btn').click();
    expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('create-field-amount').value).toBe('');
    expect(document.getElementById('create-field-date').value).toBe('');
    expect(document.getElementById('create-field-category').value).toBe('');
    expect(document.getElementById('create-field-description').value).toBe('');
  });

  test('submitting a valid expense adds it to the top of the table immediately', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const firstRow = document.querySelector('#expense-tbody tr');
    expect(firstRow.querySelector('.desc-cell').textContent).toBe('Taxi to airport');
    expect(firstRow.querySelector('.col-amount').textContent).toBe('$24.50');
  });

  test('a valid submit shows a success toast', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toBe('Expense logged');
  });

  test('an amount with more than two decimal places shows a decimal-place-specific error', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '12.345';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('create-error-amount').hidden).toBe(false);
    expect(document.getElementById('create-error-amount').textContent).toMatch(/at most 2 decimal places/i);
  });

  test('submitting with every field empty shows an inline error under every field', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('create-error-amount').hidden).toBe(false);
    expect(document.getElementById('create-error-date').hidden).toBe(false);
    expect(document.getElementById('create-error-category').hidden).toBe(false);
    expect(document.getElementById('create-error-description').hidden).toBe(false);
  });

  test('submitting with invalid fields adds nothing to the table and keeps the modal open', () => {
    const before = document.querySelectorAll('#expense-tbody tr').length;
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
    expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
  });

  test('a localStorage failure on submit shows an error toast', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t log/i);
    setItemSpy.mockRestore();
  });

  test('a localStorage failure keeps the modal open with entered values intact', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('create-field-amount').value).toBe('24.50');
    expect(document.getElementById('create-field-description').value).toBe('Taxi to airport');
    setItemSpy.mockRestore();
  });

  test('cancelling the create modal adds nothing to the table', () => {
    const before = document.querySelectorAll('#expense-tbody tr').length;
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '99.99';
    document.getElementById('create-modal-cancel-btn').click();
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
    expect(document.getElementById('create-modal-wrap').hidden).toBe(true);
  });

  test('cancelling while a save is in flight does not persist the expense or add it to the table', () => {
    const before = document.querySelectorAll('#expense-tbody tr').length;
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    document.getElementById('create-modal-cancel-btn').click();
    jest.advanceTimersByTime(350);

    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.description === 'Taxi to airport')).toBe(false);
  });

  test('a newly created expense is still present in localStorage after the save completes', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.description === 'Taxi to airport')).toBe(true);
  });

  test('validateAmount flags more than two decimal places distinctly from "required"', () => {
    const { validateAmount } = require('../public/js/expenses');
    expect(validateAmount('')).toMatch(/required/i);
    expect(validateAmount('12.345')).toMatch(/at most 2 decimal places/i);
    expect(validateAmount('12.34')).toBe('');
  });

  test('the modal title, subtitle, and save button copy match the approved design', () => {
    document.getElementById('add-expense-btn').click();
    expect(document.getElementById('create-modal-title').textContent).toBe('Log an expense');
    expect(document.querySelector('#create-modal-wrap .modal-header p').textContent)
      .toBe('Fill in every field below to add it to the shared expense list.');
    expect(document.getElementById('create-modal-save-btn').textContent).toBe('Log expense');
  });

  test('while saving, the button shows "Logging…" per the approved design', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('create-modal-save-btn').textContent).toBe('Logging…');
  });

  test('a newly logged expense is attributed to whoever is currently signed in', () => {
    document.getElementById('viewer-select').value = 'Priya Shah';
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);
    const firstRow = document.querySelector('#expense-tbody tr');
    expect(firstRow.querySelector('.logged-by-cell').textContent).toBe('Priya Shah');
  });

  test('switching who is signed in after logging an expense does not hide it', () => {
    document.getElementById('viewer-select').value = 'Morgan Ellis';
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-field-amount').value = '24.50';
    document.getElementById('create-field-date').value = '2026-09-20';
    document.getElementById('create-field-category').value = 'Travel';
    document.getElementById('create-field-description').value = 'Taxi to airport';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    jest.advanceTimersByTime(350);

    document.getElementById('viewer-select').value = 'Devon Ruiz';
    document.getElementById('viewer-select').dispatchEvent(new Event('change'));

    const rows = Array.from(document.querySelectorAll('#expense-tbody tr'));
    expect(rows.some((r) => r.querySelector('.desc-cell').textContent === 'Taxi to airport')).toBe(true);
  });

  test('the viewer switcher lists the three staff members from the approved design', () => {
    const options = Array.from(document.querySelectorAll('#viewer-select option')).map((o) => o.textContent);
    expect(options).toEqual(['Morgan Ellis', 'Priya Shah', 'Devon Ruiz']);
  });

  test('the expense list page states that logging an expense is visible to every staff member', () => {
    expect(document.querySelector('.shared-visibility-hint').textContent).toMatch(/visible to everyone/i);
  });

  test.each(['0', '-12.50'])('AC3: validateAmount rejects %s', (value) => {
    const { validateAmount } = require('../public/js/expenses');
    expect(validateAmount(value)).toMatch(/greater than \$0\.00|valid amount/i);
  });

  test('AC3: validateAmount rejects zero with the greater-than message', () => {
    const { validateAmount } = require('../public/js/expenses');
    expect(validateAmount('0')).toMatch(/greater than \$0\.00/i);
  });

  test('AC2: a blocked blank create submit applies no default value', () => {
    document.getElementById('add-expense-btn').click();
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('create-field-category').value).toBe('');
    expect(document.getElementById('create-field-date').value).toBe('');
    expect(document.getElementById('create-field-amount').value).toBe('');
  });

  test('AC5/AC6: both forms offer only the fixed categories with no management control', () => {
    const opts = (sel) => Array.from(document.querySelectorAll(sel)).map((o) => o.textContent);
    expect(opts('#create-field-category option')).toEqual(['Select a category', 'Travel', 'Meals', 'Software', 'Office Supplies', 'Other']);
    expect(opts('#create-field-category option')).toEqual(opts('#field-category option'));
    expect(document.querySelector('[id*="category" i][id*="add" i], [id*="manage-categor" i]')).toBeNull();
  });

  test('AC10/AC11: no attachment or delete control on the create flow', () => {
    document.getElementById('add-expense-btn').click();
    expect(document.querySelector('#create-form input[type="file"], [id*="receipt" i], [id*="attach" i]')).toBeNull();
    expect(Array.from(document.querySelectorAll('button')).some((b) => /delete/i.test(b.textContent) || /delete/i.test(b.id))).toBe(false);
  });
});
