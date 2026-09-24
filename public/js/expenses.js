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

function validateAmount(raw) {
  const trimmed = (raw || '').trim();
  if (trimmed === '') return 'Amount is required.';
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid amount, e.g. 24.50.';
  const decimalMatch = trimmed.match(/\.(\d+)$/);
  if (decimalMatch && decimalMatch[1].length > 2) {
    return 'Amount can have at most 2 decimal places.';
  }
  if (parseFloat(trimmed) <= 0) return 'Enter an amount greater than $0.00.';
  return '';
}

function validateCreateExpenseFields({ amount, date, category, description }) {
  return {
    amount: validateAmount(amount) || null,
    date: date === '' ? 'Date is required.' : null,
    category: category === '' ? 'Category is required.' : null,
    description: (description || '').trim() === '' ? 'Description is required.' : null,
  };
}

function initExpensesApp(doc = document) {
  let expenses = loadExpenses();
  let editingId = null;
  let lastUpdatedId = null;
  let lastAddedId = null;
  let nextId = expenses.length + 1;

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

  function renderList() {
    const tbody = doc.getElementById('expense-tbody');
    tbody.innerHTML = '';

    if (expenses.length === 0) {
      const tr = doc.createElement('tr');
      tr.className = 'empty-row';
      tr.innerHTML = '<td colspan="5">No expenses yet.</td>';
      tbody.appendChild(tr);
      return;
    }

    expenses.forEach((exp) => {
      const tr = doc.createElement('tr');
      if (exp.id === lastUpdatedId) tr.className = 'row-updated';
      if (exp.id === lastAddedId) tr.className = 'row-added';
      tr.innerHTML = `
        <td>${formatDateDisplay(exp.date)}</td>
        <td><span class="chip">${exp.category}</span></td>
        <td class="desc-cell">${escapeHtml(doc, exp.description) || '—'}</td>
        <td class="col-amount">${formatUSD(exp.amount)}</td>
        <td class="col-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${exp.id}">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lastUpdatedId = null;
    lastAddedId = null;

    tbody.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit-id')));
    });
  }

  function setFieldError(fieldEl, errorEl, hasError, message) {
    errorEl.hidden = !hasError;
    if (hasError && message) errorEl.textContent = '⚠ ' + message;
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
    showToast('success', 'Changes discarded — record unchanged');
  }

  function showToast(kind, message) {
    doc.getElementById('toast-icon').textContent = kind === 'error' ? '⚠' : '✓';
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  doc.getElementById('modal-close-btn').addEventListener('click', cancelEdit);
  doc.getElementById('modal-cancel-btn').addEventListener('click', cancelEdit);
  overlay.addEventListener('click', cancelEdit);

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
        showToast('error', 'Expense could not be saved — please try again');
        return;
      }
      expenses[idx] = updated;
      lastUpdatedId = expenses[idx].id;
      closeModal();
      renderList();
      showToast('success', 'Expense updated');
    }, 350);
  });

  // ---------- Create modal ----------
  const createOverlay = doc.getElementById('create-modal-overlay');
  const createModalWrap = doc.getElementById('create-modal-wrap');
  const createForm = doc.getElementById('create-form');
  const createSaveBtn = doc.getElementById('create-modal-save-btn');

  const createFieldAmount = doc.getElementById('create-field-amount');
  const createFieldDate = doc.getElementById('create-field-date');
  const createFieldCategory = doc.getElementById('create-field-category');
  const createFieldDescription = doc.getElementById('create-field-description');

  const createErrorAmount = doc.getElementById('create-error-amount');
  const createErrorDate = doc.getElementById('create-error-date');
  const createErrorCategory = doc.getElementById('create-error-category');
  const createErrorDescription = doc.getElementById('create-error-description');
  let createSaveTimer = null;

  function clearAllCreateErrors() {
    setFieldError(createFieldAmount, createErrorAmount, false);
    setFieldError(createFieldDate, createErrorDate, false);
    setFieldError(createFieldCategory, createErrorCategory, false);
    setFieldError(createFieldDescription, createErrorDescription, false);
  }

  function openCreateModal() {
    createForm.reset();
    clearAllCreateErrors();
    createOverlay.hidden = false;
    createModalWrap.hidden = false;
    doc.addEventListener('keydown', onCreateModalKeydown);
    createFieldAmount.focus();
  }

  function closeCreateModal() {
    createOverlay.hidden = true;
    createModalWrap.hidden = true;
    createSaveBtn.disabled = false;
    createSaveBtn.textContent = 'Save expense';
    doc.removeEventListener('keydown', onCreateModalKeydown);
    clearTimeout(createSaveTimer);
    createSaveTimer = null;
  }

  function onCreateModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelCreate();
    }
  }

  function cancelCreate() {
    closeCreateModal();
  }

  doc.getElementById('add-expense-btn').addEventListener('click', openCreateModal);
  doc.getElementById('create-modal-close-btn').addEventListener('click', cancelCreate);
  doc.getElementById('create-modal-cancel-btn').addEventListener('click', cancelCreate);
  createOverlay.addEventListener('click', cancelCreate);

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const amountRaw = createFieldAmount.value;
    const dateValue = createFieldDate.value.trim();
    const categoryValue = createFieldCategory.value;
    const descriptionValue = createFieldDescription.value.trim();

    const errors = validateCreateExpenseFields({
      amount: amountRaw,
      date: dateValue,
      category: categoryValue,
      description: descriptionValue,
    });

    setFieldError(createFieldAmount, createErrorAmount, Boolean(errors.amount), errors.amount);
    setFieldError(createFieldDate, createErrorDate, Boolean(errors.date), errors.date);
    setFieldError(createFieldCategory, createErrorCategory, Boolean(errors.category), errors.category);
    setFieldError(createFieldDescription, createErrorDescription, Boolean(errors.description), errors.description);

    if (errors.amount || errors.date || errors.category || errors.description) {
      const firstInvalid = errors.amount ? createFieldAmount
        : errors.date ? createFieldDate
        : errors.category ? createFieldCategory
        : createFieldDescription;
      firstInvalid.focus();
      return;
    }

    createSaveBtn.disabled = true;
    createSaveBtn.textContent = 'Saving…';

    const newExpense = {
      id: 'exp_' + String(nextId++).padStart(3, '0'),
      amount: Math.round(parseFloat(amountRaw) * 100) / 100,
      date: dateValue,
      category: categoryValue,
      description: descriptionValue,
    };

    createSaveTimer = setTimeout(() => {
      try {
        persistExpenses([newExpense, ...expenses]);
      } catch (err) {
        createSaveBtn.disabled = false;
        createSaveBtn.textContent = 'Save expense';
        showToast('error', "Couldn't save expense — please try again");
        return;
      }
      expenses = [newExpense, ...expenses];
      lastAddedId = newExpense.id;
      closeCreateModal();
      renderList();
      showToast('success', 'Expense added');
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
  validateAmount,
  validateCreateExpenseFields,
  initExpensesApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initExpensesApp());
}
