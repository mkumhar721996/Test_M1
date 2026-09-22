(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExpensesView = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
  }

  function renderEmptyState(message) {
    return `<p id="empty-state">${escapeHtml(message)}</p>`;
  }

  function renderExpenseRow(expense) {
    return `<li data-expense-id="${escapeHtml(expense.id)}">
      <span>${escapeHtml(expense.description)} - $${escapeHtml(expense.amount)}</span>
      <button type="button" data-action="delete" data-id="${escapeHtml(expense.id)}">Delete</button>
    </li>`;
  }

  function renderExpenseList(expenses, emptyMessage) {
    if (expenses.length === 0) {
      return renderEmptyState(emptyMessage);
    }
    return `<ul id="expense-list">${expenses.map(renderExpenseRow).join('')}</ul>`;
  }

  function renderConfirmDialog(expense) {
    return `<div id="confirm-dialog" role="dialog" aria-modal="true">
      <p>Delete this expense permanently? This action cannot be undone.</p>
      <button type="button" data-action="confirm-delete" data-id="${escapeHtml(expense.id)}">Delete</button>
      <button type="button" data-action="cancel-delete">Cancel</button>
    </div>`;
  }

  return { renderExpenseList, renderExpenseRow, renderEmptyState, renderConfirmDialog };
});
