import { loadExpenses } from './storage.js';
import { renderExpenseList } from './render.js';

export function initApp(container) {
  renderExpenseList(container, loadExpenses());
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  initApp(document.getElementById('app'));
}
