/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Expense List Rendering', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('a malicious category value is rendered as text, not executed as HTML', () => {
    localStorage.setItem('expenses', JSON.stringify([
      { id: 'exp_xss', date: '2026-09-02', category: '<img src=x onerror="window.__pwned = true">', description: 'Test', amount: 10 },
    ]));
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);

    expect(window.__pwned).toBeUndefined();
    const chip = document.querySelector('#expense-tbody .chip');
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.textContent).toBe('<img src=x onerror="window.__pwned = true">');
  });
});

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
});

describe('Delete Expense', () => {
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

  test('activating Delete opens a confirmation prompt naming the record', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('delete-summary').textContent).toMatch(/Flight to Chicago client site/);
  });

  test('a malicious category/description is rendered as text in the delete confirmation, not executed as HTML', () => {
    localStorage.setItem('expenses', JSON.stringify([
      { id: 'exp_xss', date: '2026-09-02', category: '<img src=x onerror="window.__pwned = true">', description: '<img src=x onerror="window.__pwned2 = true">', amount: 10 },
    ]));
    jest.resetModules();
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document);

    document.querySelector('[data-delete-id="exp_xss"]').click();

    expect(window.__pwned).toBeUndefined();
    expect(window.__pwned2).toBeUndefined();
    const summary = document.getElementById('delete-summary');
    expect(summary.querySelector('img')).toBeNull();
    expect(summary.textContent).toContain('<img src=x onerror="window.__pwned = true">');
    expect(summary.textContent).toContain('<img src=x onerror="window.__pwned2 = true">');
  });

  test('confirming deletion removes the row immediately', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_001"]')).toBeNull();
  });

  test('confirming deletion shows a success toast', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toBe('Expense deleted');
  });

  test('cancelling leaves the record in the table', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('delete-modal-cancel-btn').click();
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('expenses')).find((e) => e.id === 'exp_001')).toBeTruthy();
  });

  test('cancelling while a confirmed deletion is in flight does not delete the record once the delay elapses', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    document.getElementById('delete-modal-cancel-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('expenses')).find((e) => e.id === 'exp_001')).toBeTruthy();
  });

  test('a localStorage failure on confirm shows an error toast', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast-message').textContent).toMatch(/could not be deleted/i);
    expect(document.getElementById('toast').dataset.variant).toBe('error');
    setItemSpy.mockRestore();
  });

  test('a localStorage failure on confirm leaves the record in the table', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    setItemSpy.mockRestore();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_001')).toBe(true);
  });

  test('deleting the last expense shows the empty-state message', () => {
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    expect(document.getElementById('empty-wrap').hidden).toBe(false);
    expect(document.getElementById('list-wrap').hidden).toBe(true);
    expect(document.getElementById('empty-wrap').textContent).toMatch(/No expenses yet/);
  });

  test('deleting the last expense also shows the action button', () => {
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    const addBtn = document.getElementById('empty-add-btn');
    expect(addBtn).not.toBeNull();
    expect(document.getElementById('empty-wrap').contains(addBtn)).toBe(true);
    expect(document.getElementById('empty-wrap').hidden).toBe(false);
  });

  test('a deleted expense is gone after reload', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);

    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp: reinit } = require('../public/js/expenses');
    reinit(document);

    expect(document.querySelector('[data-delete-id="exp_001"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('expenses')).some((e) => e.id === 'exp_001')).toBe(false);
  });
});
