const categoriesModule = typeof module !== 'undefined' ? require('./categories') : window;

const STORAGE_KEY = 'expenses';
const INITIAL_EXPENSES = [
  { id: 'exp_001', date: '2026-09-02', categoryId: 'travel', description: 'Flight to Chicago client site', amount: 482.50 },
  { id: 'exp_002', date: '2026-09-05', categoryId: 'meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
  { id: 'exp_003', date: '2026-09-10', categoryId: 'software', description: 'Figma seat renewal', amount: 15.00 },
];

const CATEGORY_ICONS = {
  travel: '✈️',
  meals: '🍽️',
  software: '💻',
  'office-supplies': '🖇️',
  other: '🗂️',
};

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore malformed storage */ }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_EXPENSES));
  } catch (e) { /* storage unavailable — fall back to in-memory defaults */ }
  return INITIAL_EXPENSES.map((e) => ({ ...e }));
}

function persistExpenses(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDateDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function validateExpenseFields({ amount, date, category }) {
  const amountValue = parseFloat(amount);
  return {
    amount: (amount === '' || Number.isNaN(amountValue) || amountValue <= 0) ? 'Amount is required.' : null,
    date: date === '' ? 'Date is required.' : null,
    category: category === '' ? 'Category is required.' : null,
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Resolves to the category's current name, or null for an explicit null categoryId
// AND for a "dangling" categoryId that matches no current category (e.g. a deleted
// category) — both cases render/filter as Uncategorised.
function resolveCategoryName(categoryId, categories) {
  if (!categoryId) return null;
  const match = categories.find((c) => c.id === categoryId);
  return match ? match.name : null;
}

function reassignExpensesFromDeletedCategory(expenses, categoryId) {
  return expenses.map((e) => (e.categoryId === categoryId ? { ...e, categoryId: null } : e));
}

function initExpensesApp(doc = document) {
  let expenses = loadExpenses();
  let categories = categoriesModule.loadCategories();
  let editingId = null;
  let lastUpdatedId = null;
  let filter = 'all';
  let grouped = false;

  const overlay = doc.getElementById('modal-overlay');
  const modalWrap = doc.getElementById('modal-wrap');
  const form = doc.getElementById('edit-form');
  const saveBtn = doc.getElementById('modal-save-btn');

  const fieldAmount = doc.getElementById('field-amount');
  const fieldDate = doc.getElementById('field-date');
  const fieldCategory = doc.getElementById('field-category');
  const fieldDescription = doc.getElementById('field-description');

  const errorAmount = doc.getElementById('error-amount');
  const errorDate = doc.getElementById('error-date');
  const errorCategory = doc.getElementById('error-category');

  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');
  let toastTimer = null;

  const filterSelect = doc.getElementById('filter-category');
  const clearFilterBtn = doc.getElementById('clear-filter-btn');
  const viewFlatBtn = doc.getElementById('view-flat-btn');
  const viewGroupedBtn = doc.getElementById('view-grouped-btn');
  const listEl = doc.getElementById('expense-list');
  const emptyEl = doc.getElementById('empty-state');
  const summaryEl = doc.getElementById('list-summary');

  function isUncategorised(exp) {
    return resolveCategoryName(exp.categoryId, categories) === null;
  }

  function renderCategoryFieldOptions() {
    fieldCategory.innerHTML = '<option value="">Select a category</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function renderFilterOptions() {
    filterSelect.innerHTML = '<option value="all">All categories</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') +
      '<option value="uncategorised">Uncategorised (no category assigned)</option>';

    const validValues = ['all', 'uncategorised', ...categories.map((c) => c.id)];
    if (!validValues.includes(filter)) filter = 'all';
    filterSelect.value = filter;
  }

  function updateClearFilterVisibility() {
    clearFilterBtn.style.display = filter === 'all' ? 'none' : 'inline-flex';
  }

  function expenseRowHtml(exp) {
    const name = resolveCategoryName(exp.categoryId, categories);
    const chipHtml = name
      ? `<span class="chip">${CATEGORY_ICONS[exp.categoryId] || '🗂️'} ${escapeHtml(name)}</span>`
      : '<span class="chip chip-uncategorised">❔ Uncategorised</span>';
    const updatedClass = exp.id === lastUpdatedId ? ' row-updated' : '';
    return `
      <li class="expense-row card${updatedClass}">
        <div class="expense-row-main">
          ${chipHtml}
          <span class="expense-desc">${escapeHtml(exp.description) || '—'}</span>
        </div>
        <div class="expense-row-meta">
          <span class="expense-date u-text-sm u-text-muted">${formatDateDisplay(exp.date)}</span>
          <span class="expense-amount">${formatUSD(exp.amount)}</span>
          <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${exp.id}">Edit</button>
        </div>
      </li>`;
  }

  function renderFlat(items) {
    return items.map(expenseRowHtml).join('');
  }

  function renderGrouped(items) {
    let html = '';
    categories.forEach((cat) => {
      const group = items.filter((e) => e.categoryId === cat.id);
      if (group.length === 0) return;
      const subtotal = group.reduce((sum, e) => sum + e.amount, 0);
      html += `
        <li class="group-heading">
          <span class="group-heading-name">${CATEGORY_ICONS[cat.id] || '🗂️'} ${escapeHtml(cat.name)}</span>
          <span class="group-heading-meta">${pluralize(group.length, 'expense')} · ${formatUSD(subtotal)} subtotal</span>
        </li>` + renderFlat(group);
    });
    const uncategorised = items.filter((e) => isUncategorised(e));
    if (uncategorised.length > 0) {
      html += `
        <li class="group-heading group-heading-uncategorised">
          <span class="group-heading-name">❔ Uncategorised</span>
          <span class="group-heading-meta">${pluralize(uncategorised.length, 'expense')} · no category assigned</span>
        </li>` + renderFlat(uncategorised);
    }
    return html;
  }

  function renderList() {
    const total = expenses.length;
    const totalSum = expenses.reduce((sum, e) => sum + e.amount, 0);

    let visible = expenses;
    if (filter === 'uncategorised') {
      visible = expenses.filter((e) => isUncategorised(e));
    } else if (filter !== 'all') {
      visible = expenses.filter((e) => e.categoryId === filter);
    }

    if (total === 0) {
      summaryEl.textContent = 'No expenses recorded yet';
    } else if (filter === 'all') {
      summaryEl.textContent = `${pluralize(total, 'expense')} · ${formatUSD(totalSum)} total`;
    } else {
      const visSum = visible.reduce((sum, e) => sum + e.amount, 0);
      const category = categories.find((c) => c.id === filter);
      const label = filter === 'uncategorised' ? 'Uncategorised' : (category ? category.name : filter);
      summaryEl.textContent = `Showing ${visible.length} of ${total} expenses in "${label}" · ${formatUSD(visSum)} shown`;
    }

    updateClearFilterVisibility();

    if (visible.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      emptyEl.innerHTML = total === 0
        ? `
          <p class="empty-state-icon" aria-hidden="true">🧾</p>
          <h2 class="u-text-lg">No expenses yet</h2>
          <p class="u-text-md u-text-muted">Add your first expense to start tracking spend by category.</p>
          <button type="button" class="btn btn-primary">+ Add expense</button>`
        : `
          <p class="empty-state-icon" aria-hidden="true">🔍</p>
          <h2 class="u-text-lg">No expenses match this filter</h2>
          <p class="u-text-md u-text-muted">Try a different category, or clear the filter to see everything again.</p>
          <button type="button" class="btn btn-primary" id="empty-clear-filter-btn">✕ Clear filter</button>`;
      emptyEl.style.display = 'block';
      const emptyClearBtn = doc.getElementById('empty-clear-filter-btn');
      if (emptyClearBtn) emptyClearBtn.addEventListener('click', () => setFilter('all'));
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = 'flex';
    listEl.innerHTML = grouped ? renderGrouped(visible) : renderFlat(visible);
    lastUpdatedId = null;

    listEl.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit-id')));
    });
  }

  function setFilter(value) {
    filter = value;
    if (filterSelect.value !== value) filterSelect.value = value;
    renderList();
  }

  function setGrouped(value) {
    grouped = value;
    viewFlatBtn.classList.toggle('active', !value);
    viewFlatBtn.setAttribute('aria-pressed', String(!value));
    viewGroupedBtn.classList.toggle('active', value);
    viewGroupedBtn.setAttribute('aria-pressed', String(value));
    renderList();
  }

  function setFieldError(fieldEl, errorEl, hasError) {
    errorEl.hidden = !hasError;
    fieldEl.classList.toggle('input-invalid', hasError);
    fieldEl.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  }

  function clearAllErrors() {
    setFieldError(fieldAmount, errorAmount, false);
    setFieldError(fieldDate, errorDate, false);
    setFieldError(fieldCategory, errorCategory, false);
  }

  function openEditModal(id) {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    editingId = id;

    fieldAmount.value = exp.amount.toFixed(2);
    fieldDate.value = exp.date;
    fieldCategory.value = exp.categoryId || '';
    fieldDescription.value = exp.description;
    clearAllErrors();

    overlay.hidden = false;
    modalWrap.hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
    fieldAmount.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    editingId = null;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
    doc.removeEventListener('keydown', onModalKeydown);
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function cancelEdit() {
    closeModal();
    showToast('Changes discarded — record unchanged');
  }

  function showToast(message) {
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  doc.getElementById('modal-close-btn').addEventListener('click', cancelEdit);
  doc.getElementById('modal-cancel-btn').addEventListener('click', cancelEdit);
  overlay.addEventListener('click', cancelEdit);

  filterSelect.addEventListener('change', () => setFilter(filterSelect.value));
  clearFilterBtn.addEventListener('click', () => setFilter('all'));
  viewFlatBtn.addEventListener('click', () => setGrouped(false));
  viewGroupedBtn.addEventListener('click', () => setGrouped(true));

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const amountRaw = fieldAmount.value.trim();
    const dateValue = fieldDate.value.trim();
    const categoryValue = fieldCategory.value;

    const errors = validateExpenseFields({ amount: amountRaw, date: dateValue, category: categoryValue });

    setFieldError(fieldAmount, errorAmount, Boolean(errors.amount));
    setFieldError(fieldDate, errorDate, Boolean(errors.date));
    setFieldError(fieldCategory, errorCategory, Boolean(errors.category));

    if (errors.amount || errors.date || errors.category) {
      const firstInvalid = errors.amount ? fieldAmount : errors.date ? fieldDate : fieldCategory;
      firstInvalid.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const targetId = editingId;

    setTimeout(() => {
      if (editingId !== targetId) return;

      const idx = expenses.findIndex((e) => e.id === targetId);
      if (idx === -1) return;

      const updated = {
        ...expenses[idx],
        amount: Math.round(parseFloat(amountRaw) * 100) / 100,
        date: dateValue,
        categoryId: categoryValue,
        description: fieldDescription.value.trim(),
      };
      try {
        persistExpenses([
          ...expenses.slice(0, idx),
          updated,
          ...expenses.slice(idx + 1),
        ]);
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
        showToast('Expense could not be saved — please try again');
        return;
      }
      expenses[idx] = updated;
      lastUpdatedId = expenses[idx].id;
      closeModal();
      renderList();
      showToast('Expense updated');
    }, 350);
  });

  renderCategoryFieldOptions();
  renderFilterOptions();
  renderList();
}

module.exports = {
  STORAGE_KEY,
  INITIAL_EXPENSES,
  loadExpenses,
  persistExpenses,
  formatUSD,
  validateExpenseFields,
  resolveCategoryName,
  reassignExpensesFromDeletedCategory,
  initExpensesApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initExpensesApp());
}
