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
    expect(document.getElementById('toast-message').textContent).toBe('Expense added');
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
    expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t save/i);
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
});
