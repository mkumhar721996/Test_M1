import { formatCurrency, formatDate } from './format.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCount(n) {
  return n + (n === 1 ? ' expense' : ' expenses');
}

function emptyStateHTML() {
  return `
    <div class="empty-state" role="status">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2"></rect>
        <path d="M8 8h8M8 12h8M8 16h5"></path>
      </svg>
      <h2 class="empty-state-title">No expenses yet</h2>
      <p class="empty-state-body">Start tracking your spending — add your first expense to see it listed here.</p>
      <button type="button" class="btn btn-primary" id="empty-add-first-btn">+ Add your first expense</button>
    </div>`;
}

function rowHTML(e) {
  return `<li class="expense-row">
    <div class="expense-primary">
      <span class="expense-amount"><span class="sr-only">Amount:</span> ${formatCurrency(e.amount)}</span>
      <span class="chip"><span class="sr-only">Category:</span> ${escapeHtml(e.category)}</span>
    </div>
    <p class="expense-description"><span class="sr-only">Description:</span> ${escapeHtml(e.description)}</p>
    <div class="expense-date u-text-sm u-text-muted"><span class="sr-only">Date:</span> <time datetime="${escapeHtml(e.date)}">${formatDate(e.date)}</time></div>
  </li>`;
}

function listHTML(expenses) {
  return `
    <p class="list-count">${formatCount(expenses.length)}</p>
    <ul class="expense-list" aria-label="Expenses, most recently added first">
      ${expenses.map(rowHTML).join('')}
    </ul>`;
}

export function renderExpenseList(container, expenses) {
  container.innerHTML = expenses.length === 0 ? emptyStateHTML() : listHTML(expenses);
}
