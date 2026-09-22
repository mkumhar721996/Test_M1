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

function initExpensesApp(doc = document) {
  let expenses = loadExpenses();
  let editingId = null;
  let lastUpdatedId = null;

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
      tr.innerHTML = `
        <td>${formatDateDisplay(exp.date)}</td>
        <td><span class="chip">${exp.category}</span></td>
        <td class="desc-cell">${escapeHtml(exp.description) || '—'}</td>
        <td class="col-amount">${formatUSD(exp.amount)}</td>
        <td class="col-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${exp.id}">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lastUpdatedId = null;

    tbody.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit-id')));
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
