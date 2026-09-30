/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Delete an Expense', () => {
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

  test('clicking Delete on a row opens a confirmation dialog naming that expense', () => {
    document.querySelector('[data-delete-id="exp_002"]').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('confirm-summary').textContent).toMatch(/Team lunch/);
  });

  test('confirming delete permanently removes the expense from the list', () => {
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_002')).toBe(false);
  });

  test('a deleted expense stays gone for every staff member', () => {
    document.getElementById('viewer-select').value = 'Morgan Ellis';
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    document.getElementById('viewer-select').value = 'Priya Shah';
    document.getElementById('viewer-select').dispatchEvent(new Event('change'));
    expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
  });

  test('any staff member can delete an expense logged by someone else', () => {
    document.getElementById('viewer-select').value = 'Devon Ruiz';
    document.querySelector('[data-delete-id="exp_001"]').click(); // logged by Morgan Ellis
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_001')).toBe(false);
  });

  test('every row exposes an enabled Delete action with no gating', () => {
    const deleteButtons = Array.from(document.querySelectorAll('[data-delete-id]'));
    expect(deleteButtons).toHaveLength(3);
    deleteButtons.forEach((btn) => expect(btn.disabled).toBe(false));
  });

  test('the list updates immediately after confirming', () => {
    const before = document.querySelectorAll('#expense-tbody tr').length;
    document.querySelector('[data-delete-id="exp_003"]').click();
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before - 1);
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
  });

  test('cancelling the confirmation dialog deletes nothing', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('delete-modal-cancel-btn').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
  });

  test('Escape dismisses the confirmation dialog without deleting', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
  });

  test('a successful delete shows a success toast', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    expect(document.getElementById('toast-message').textContent).toBe('Expense deleted');
  });

  test('deleting every expense reveals the empty state', () => {
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('delete-modal-delete-btn').click();
      jest.advanceTimersByTime(300);
    });
    expect(document.querySelector('.empty-row')).not.toBeNull();
  });

  test('cancelling while a delete is in flight does not remove the expense', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('delete-modal-delete-btn').click();
    document.getElementById('delete-modal-cancel-btn').click();
    jest.advanceTimersByTime(300);
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_001')).toBe(true);
    expect(document.querySelector('[data-delete-id="exp_001"]').closest('tr').classList.contains('row-removing')).toBe(false);
  });

  test('a localStorage failure on delete shows an error toast and keeps the dialog open', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    const rowBefore = document.querySelector('[data-delete-id="exp_001"]').closest('tr');
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(rowBefore.classList.contains('row-removing')).toBe(false);
    const deleteBtn = document.getElementById('delete-modal-delete-btn');
    expect(deleteBtn.disabled).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t delete/i);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    setItemSpy.mockRestore();
  });

  test('a retried delete after a localStorage failure succeeds', () => {
    document.querySelector('[data-delete-id="exp_001"]').click();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    setItemSpy.mockRestore();

    document.getElementById('delete-modal-delete-btn').click();
    jest.advanceTimersByTime(300);
    expect(document.querySelector('[data-delete-id="exp_001"]')).toBeNull();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_001')).toBe(false);
  });

  test('the page states that any staff member can delete any expense with no restriction', () => {
    expect(document.querySelector('.no-restriction-note').textContent)
      .toMatch(/no owner, date, or status check/i);
  });
});
