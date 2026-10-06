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
    expect(document.getElementById('toast-message').textContent).toBe("Couldn't save changes — please try again");

    setItemSpy.mockRestore();
  });

  const submitEdit = () => document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const storedExpense = (id) => JSON.parse(localStorage.getItem('expenses')).find((e) => e.id === id);

  test('AC1: a blank Date blocks the edit with an inline error', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-date').value = '';
    submitEdit();
    expect(document.getElementById('error-date').hidden).toBe(false);
    expect(document.getElementById('modal-wrap').hidden).toBe(false);
  });

  test('AC2: a blocked edit applies no default to the invalid field or the untouched fields', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-category').value = '';
    submitEdit();
    expect(document.getElementById('field-category').value).toBe('');
    expect(document.getElementById('field-date').value).toBe('2026-09-02');
  });

  test.each(['0', '-12.50'])('AC3: edit amount %s is blocked with an inline error', (value) => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = value;
    submitEdit();
    expect(document.getElementById('error-amount').hidden).toBe(false);
    expect(storedExpense('exp_001')?.amount ?? 482.5).toBe(482.5);
  });

  test('AC3: edit amount with more than 2 decimal places is blocked, not rounded', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '19.999';
    submitEdit();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('error-amount').hidden).toBe(false);
    expect(document.getElementById('error-amount').textContent).toMatch(/at most 2 decimal places/i);
    expect(storedExpense('exp_001').amount).toBe(482.5);
  });

  test('AC4: an arbitrarily large 2-decimal amount saves on edit', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '1500000.00';
    submitEdit();
    jest.advanceTimersByTime(350);
    expect(storedExpense('exp_001').amount).toBe(1500000);
  });

  test('AC5/AC6: the edit category select offers only the fixed list and no management control', () => {
    const opts = Array.from(document.querySelectorAll('#field-category option')).map((o) => o.textContent);
    expect(opts).toEqual(['Select a category', 'Travel', 'Meals', 'Software', 'Office Supplies', 'Other']);
    expect(document.querySelector('[id*="category" i][id*="add" i], [id*="manage-categor" i]')).toBeNull();
  });

  test('AC1/AC4: editing preserves the original logger, shows who last edited it, and stays visible after switching viewers', () => {
    const viewer = document.getElementById('viewer-select');
    viewer.value = 'Priya Shah';
    document.querySelector('[data-edit-id="exp_001"]').click();
    expect(document.getElementById('origin-note').textContent).toBe('Originally logged by Morgan Ellis on 09/02/2026.');
    document.getElementById('field-amount').value = '500.00';
    submitEdit();
    jest.advanceTimersByTime(350);
    expect(storedExpense('exp_001').loggedBy).toBe('Morgan Ellis');
    expect(storedExpense('exp_001').lastEditedBy).toBe('Priya Shah');

    viewer.value = 'Devon Ruiz';
    viewer.dispatchEvent(new Event('change'));
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.logged-by-cell').textContent).toBe('Morgan EllisEdited by Priya Shah');
  });

  test('AC2/AC3: the edit Amount field matches the design and still blocks invalid values', () => {
    expect(document.getElementById('field-amount').type).toBe('text');
    expect(document.getElementById('field-amount').getAttribute('inputmode')).toBe('decimal');
    expect(document.getElementById('field-amount').placeholder).toBe('0.00');
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '19.999';
    submitEdit();
    expect(document.getElementById('error-amount').textContent).toMatch(/at most 2 decimal places/i);
    expect(storedExpense('exp_001').amount).toBe(482.5);
  });

  test('AC5: the row for an edited expense still has only an Edit action', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '500.00';
    submitEdit();
    jest.advanceTimersByTime(350);
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    const buttons = Array.from(row.querySelectorAll('button'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Edit');
  });

  test('AC9: a saved edit shows no pending/approval/status workflow state', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    submitEdit();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
    expect(document.querySelector('[class*="pending" i], [class*="approval" i], [class*="status" i]')).toBeNull();
  });

  test('AC10: no receipt or attachment control on either form', () => {
    expect(document.querySelector('#edit-form input[type="file"], #create-form input[type="file"], [id*="receipt" i], [id*="attach" i]')).toBeNull();
  });

  test('AC11: no delete control anywhere in the document', () => {
    const buttons = Array.from(document.querySelectorAll('button'));
    expect(buttons.some((b) => /delete/i.test(b.textContent) || /delete/i.test(b.id))).toBe(false);
  });
});
