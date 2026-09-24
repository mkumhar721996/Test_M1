const { escapeHtml, formatDateDisplay } = require('./utils');

const STORAGE_KEY = 'expenses';
const CATEGORIES = ['Travel', 'Meals', 'Software', 'Office Supplies', 'Other'];
const INITIAL_EXPENSES = [
  { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
  { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
  { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00 },
];

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

function validateExpenseFields({ amount, date, category }) {
  const amountValue = parseFloat(amount);
  return {
    amount: (amount === '' || Number.isNaN(amountValue) || amountValue <= 0) ? 'Amount is required.' : null,
    date: date === '' ? 'Date is required.' : null,
    category: category === '' ? 'Category is required.' : null,
  };
}

function initExpensesApp(doc = document) {
  let expenses = loadExpenses();
  let editingId = null;
  let lastUpdatedId = null;
  let pendingDeleteId = null;

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
  const toastIcon = doc.getElementById('toast-icon');
  let toastTimer = null;

  const listWrap = doc.getElementById('list-wrap');
  const emptyWrap = doc.getElementById('empty-wrap');

  const deleteOverlay = doc.getElementById('delete-modal-overlay');
  const deleteModalWrap = doc.getElementById('delete-modal-wrap');
  const deleteSummary = doc.getElementById('delete-summary');
  const confirmDeleteBtn = doc.getElementById('confirm-delete-btn');

  function renderList() {
    const tbody = doc.getElementById('expense-tbody');
    tbody.innerHTML = '';

    if (expenses.length === 0) {
      listWrap.hidden = true;
      emptyWrap.hidden = false;
      return;
    }

    listWrap.hidden = false;
    emptyWrap.hidden = true;

    expenses.forEach((exp) => {
      const tr = doc.createElement('tr');
      if (exp.id === lastUpdatedId) tr.className = 'row-updated';
      tr.innerHTML = `
        <td>${formatDateDisplay(exp.date)}</td>
        <td><span class="chip">${escapeHtml(doc, exp.category)}</span></td>
        <td class="desc-cell">${escapeHtml(doc, exp.description) || '—'}</td>
        <td class="col-amount">${formatUSD(exp.amount)}</td>
        <td class="col-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${exp.id}">Edit</button>
          <button class="btn btn-secondary btn-sm" type="button" data-delete-id="${exp.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lastUpdatedId = null;

    tbody.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit-id')));
    });
    tbody.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', () => openDeleteModal(btn.getAttribute('data-delete-id')));
    });
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
    fieldCategory.value = exp.category;
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
    showToast('Changes discarded — record unchanged', 'success');
  }

  function showToast(message, variant = 'success') {
    toastMessage.textContent = message;
    toastIcon.textContent = variant === 'error' ? '⚠' : '✓';
    toast.dataset.variant = variant;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  doc.getElementById('modal-close-btn').addEventListener('click', cancelEdit);
  doc.getElementById('modal-cancel-btn').addEventListener('click', cancelEdit);
  overlay.addEventListener('click', cancelEdit);

  function openDeleteModal(id) {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    pendingDeleteId = id;

    deleteSummary.innerHTML = `
      <p style="margin:0;color:var(--color-fg);">
        ${formatDateDisplay(exp.date)} · ${escapeHtml(doc, exp.category)}<br>
        ${escapeHtml(doc, exp.description) || '—'}<br>
        <strong>${formatUSD(exp.amount)}</strong>
      </p>
    `;

    deleteOverlay.hidden = false;
    deleteModalWrap.hidden = false;
    doc.addEventListener('keydown', onDeleteModalKeydown);
    confirmDeleteBtn.focus();
  }

  function closeDeleteModal() {
    deleteOverlay.hidden = true;
    deleteModalWrap.hidden = true;
    pendingDeleteId = null;
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.textContent = 'Delete expense';
    doc.removeEventListener('keydown', onDeleteModalKeydown);
  }

  function onDeleteModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelDelete();
    }
  }

  function cancelDelete() {
    closeDeleteModal();
  }

  doc.getElementById('delete-modal-close-btn').addEventListener('click', cancelDelete);
  doc.getElementById('delete-modal-cancel-btn').addEventListener('click', cancelDelete);
  deleteOverlay.addEventListener('click', cancelDelete);

  confirmDeleteBtn.addEventListener('click', () => {
    const targetId = pendingDeleteId;
    if (!targetId) return;

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'Deleting…';

    setTimeout(() => {
      const idx = expenses.findIndex((e) => e.id === targetId);
      if (idx === -1) { closeDeleteModal(); return; }

      const remaining = [...expenses.slice(0, idx), ...expenses.slice(idx + 1)];
      try {
        persistExpenses(remaining);
      } catch (err) {
        closeDeleteModal();
        showToast('Expense could not be deleted — please try again', 'error');
        return;
      }
      expenses = remaining;
      closeDeleteModal();
      renderList();
      showToast('Expense deleted', 'success');
    }, 350);
  });

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
        category: categoryValue,
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
        showToast('Expense could not be saved — please try again', 'error');
        return;
      }
      expenses[idx] = updated;
      lastUpdatedId = expenses[idx].id;
      closeModal();
      renderList();
      showToast('Expense updated', 'success');
    }, 350);
  });

  renderList();
}

module.exports = {
  STORAGE_KEY,
  CATEGORIES,
  INITIAL_EXPENSES,
  loadExpenses,
  persistExpenses,
  formatUSD,
  validateExpenseFields,
  initExpensesApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initExpensesApp());
}
