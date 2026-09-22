const { renderExpenseList, renderConfirmDialog, renderError } = require('../public/expensesView');

describe('renderExpenseList', () => {
  test('renders the empty state message when there are no expenses', () => {
    const html = renderExpenseList([], 'No expenses yet');
    expect(html).toContain('No expenses yet');
  });

  test('renders a delete action for each expense and no empty state', () => {
    const expense = { id: 'abc-123', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' };
    const html = renderExpenseList([expense], 'No expenses yet');

    expect(html).toContain('data-action="delete"');
    expect(html).toContain('data-id="abc-123"');
    expect(html).not.toContain('No expenses yet');
  });

  test('omits a removed expense from the rendered list', () => {
    const kept = { id: 'keep-1', amount: 1, date: '2026-01-01', category: 'Food', description: 'Kept' };
    const removed = { id: 'remove-1', amount: 2, date: '2026-01-02', category: 'Food', description: 'Removed' };

    const before = renderExpenseList([kept, removed], 'No expenses yet');
    expect(before).toContain('data-id="remove-1"');

    const after = renderExpenseList([kept], 'No expenses yet');
    expect(after).not.toContain('data-id="remove-1"');
    expect(after).toContain('data-id="keep-1"');
  });

  test('escapes user-provided text to avoid injecting markup', () => {
    const expense = { id: 'xss-1', amount: 1, date: '2026-01-01', category: 'Food', description: '<script>alert(1)</script>' };
    const html = renderExpenseList([expense], 'No expenses yet');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('renderError', () => {
  test('renders the given message as an alert', () => {
    const html = renderError('Something went wrong. Please try again.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong. Please try again.');
  });

  test('escapes the message to avoid injecting markup', () => {
    const html = renderError('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('renderConfirmDialog', () => {
  test('renders a confirmation prompt warning the deletion is permanent, with confirm/cancel actions', () => {
    const expense = { id: 'abc-123' };
    const html = renderConfirmDialog(expense);

    expect(html).toMatch(/permanently/i);
    expect(html).toContain('data-action="confirm-delete"');
    expect(html).toContain('data-action="cancel-delete"');
    expect(html).toContain('data-id="abc-123"');
  });
});
