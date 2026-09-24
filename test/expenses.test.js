/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

function fixtureExpenses() {
  return [
    { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
    { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
    { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00 },
  ];
}

describe('Edit Expense via Modal Form', () => {
  let api;

  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    api = {
      listExpenses: jest.fn(() => Promise.resolve(fixtureExpenses())),
      createExpense: jest.fn(),
      updateExpense: jest.fn((id, changes) => Promise.resolve({ ...fixtureExpenses().find((e) => e.id === id), ...changes, id })),
    };
    const { initExpensesApp } = require('../public/js/expenses');
    initExpensesApp(document, api);
    await Promise.resolve();
    await Promise.resolve();
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
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('a valid submit calls api.updateExpense with the new amount', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(api.updateExpense).toHaveBeenCalledWith('exp_001', expect.objectContaining({ amount: 512.5 }));
  });

  test('the list row shows the updated amount immediately after saving', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$512.50');
  });

  test('the table reflects every updated field (date, category, description, amount) immediately after saving', async () => {
    document.querySelector('[data-edit-id="exp_002"]').click();
    document.getElementById('field-amount').value = '120.00';
    document.getElementById('field-date').value = '2026-09-20';
    document.getElementById('field-category').value = 'Software';
    document.getElementById('field-description').value = 'Updated description';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
    expect(row.children[0].textContent).toBe('09/20/2026');
    expect(row.querySelector('.chip').textContent).toBe('Software');
    expect(row.querySelector('.desc-cell').textContent).toBe('Updated description');
    expect(row.querySelector('.col-amount').textContent).toBe('$120.00');
  });

  test('a successful save shows a success toast', async () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '512.50';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
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

  test('submitting with an invalid field does not call the API and does not update the rendered expense', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(api.updateExpense).not.toHaveBeenCalled();
    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
  });

  test('the close (X) button discards in-progress edits, same as Cancel', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('modal-close-btn').click();
    expect(api.updateExpense).not.toHaveBeenCalled();
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
  });

  test('cancelling the modal discards in-progress edits to the record', () => {
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('modal-cancel-btn').click();
    expect(api.updateExpense).not.toHaveBeenCalled();
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
    await Promise.resolve();
    await Promise.resolve();
    const row = document.querySelector('[data-edit-id="exp_003"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$9.00');
  });

  test('AC4: a failed save keeps the modal open, re-enables Save, and shows an error toast — the row is not changed', async () => {
    api.updateExpense.mockImplementation(() => Promise.reject({ status: 500 }));
    document.querySelector('[data-edit-id="exp_001"]').click();
    document.getElementById('field-amount').value = '999.99';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('modal-wrap').hidden).toBe(false);
    expect(document.getElementById('modal-save-btn').disabled).toBe(false);
    expect(document.getElementById('modal-save-btn').textContent).toBe('Save changes');
    expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t save expense — server error \(500\)/);

    const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
    expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
  });
});
