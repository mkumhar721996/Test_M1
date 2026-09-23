function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function isOverLimit(category) {
  return category.spendLimit != null && category.totalSpend >= category.spendLimit;
}

function fetchCategories() {
  return fetch('/categories').then((res) => {
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.json();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCategoryRows(doc, categories) {
  const tbody = doc.getElementById('category-tbody');
  tbody.innerHTML = categories.map((cat) => {
    const name = escapeHtml(cat.name);
    const id = escapeHtml(cat.id);
    const overLimit = isOverLimit(cat);
    const limitCell = cat.spendLimit != null
      ? `<span class="cell-value">${formatUSD(cat.spendLimit)}</span>`
      : `<span class="cell-value no-limit">No limit set</span>`;
    const spendCell = overLimit
      ? `<span class="cell-value">${formatUSD(cat.totalSpend)}</span><span class="warning-badge"><span aria-hidden="true">⚠</span>Over limit</span>`
      : `<span class="cell-value">${formatUSD(cat.totalSpend)}</span>`;
    const limitBtnLabel = cat.spendLimit != null ? 'Edit limit' : 'Set limit';
    const limitAction = cat.spendLimit != null ? 'edit-limit' : 'set-limit';
    return `
      <tr class="category-row${overLimit ? ' is-warning' : ''}">
        <th scope="row" data-label="Category"><span class="cat-name">${name}</span></th>
        <td data-label="Total spend">${spendCell}</td>
        <td data-label="Spend limit">${limitCell}</td>
        <td class="row-actions" data-label="Actions">
          <button class="action-btn" type="button" aria-label="Edit ${name}" data-action="edit" data-category-id="${id}">Edit</button>
          <button class="action-btn danger" type="button" aria-label="Delete ${name}" data-action="delete" data-category-id="${id}">Delete</button>
          <button class="action-btn" type="button" aria-label="${limitBtnLabel} for ${name}" data-action="${limitAction}" data-category-id="${id}">${limitBtnLabel}</button>
        </td>
      </tr>`;
  }).join('');
}

function setState(doc, state) {
  doc.getElementById('state-loading').hidden = state !== 'loading';
  doc.getElementById('state-error').hidden = state !== 'error';
  doc.getElementById('state-success').hidden = state !== 'success';
}

function showToast(doc, message) {
  const toast = doc.getElementById('toast');
  doc.getElementById('toast-message').textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
}

const ACTION_MESSAGES = {
  edit: (name) => `Edit ${name} is not yet available`,
  delete: (name) => `Delete ${name} requested`,
  'edit-limit': (name) => `Edit limit for ${name} is not yet available`,
  'set-limit': (name) => `Set limit for ${name} is not yet available`,
};

function handleRowAction(doc, event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, categoryId } = btn.dataset;
  const name = btn.closest('tr').querySelector('.cat-name').textContent;
  const buildMessage = ACTION_MESSAGES[action];
  if (buildMessage) showToast(doc, buildMessage(name, categoryId));
}

function loadCategories(doc) {
  setState(doc, 'loading');
  return fetchCategories()
    .then((categories) => {
      renderCategoryRows(doc, categories);
      setState(doc, 'success');
    })
    .catch(() => {
      setState(doc, 'error');
    });
}

function initCategoriesApp(doc = document) {
  doc.getElementById('category-tbody').addEventListener('click', (e) => handleRowAction(doc, e));
  doc.getElementById('retry-btn').addEventListener('click', () => loadCategories(doc));
  return loadCategories(doc);
}

module.exports = {
  formatUSD,
  isOverLimit,
  fetchCategories,
  escapeHtml,
  renderCategoryRows,
  setState,
  loadCategories,
  initCategoriesApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initCategoriesApp());
}
