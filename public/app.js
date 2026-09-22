const { formatCurrencyUSD } = typeof module !== 'undefined' ? require('./currency') : window;
const { validateExpenseForm } = typeof module !== 'undefined' ? require('./validation') : window;

const CATEGORIES = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];
const CATEGORY_ICONS = {
  Food: '🍔',
  Transport: '🚗',
  Housing: '🏠',
  Entertainment: '🎬',
  Other: '🗂️',
};
function renderApp(root) {
  const expenses = [];
  let lastFocused = null;

  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const main = document.createElement('main');
  main.className = 'main-content';

  const header = document.createElement('div');
  header.className = 'page-header';

  const headerText = document.createElement('div');
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Expenses';
  const summary = document.createElement('p');
  summary.className = 'u-text-sm u-text-muted list-summary';
  headerText.appendChild(title);
  headerText.appendChild(summary);

  const addBtn = createAddExpenseButton();
  header.appendChild(headerText);
  header.appendChild(addBtn);

  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state card';
  emptyState.innerHTML = `
    <p class="empty-state-icon" aria-hidden="true">🧾</p>
    <h2 class="u-text-lg">No expenses yet</h2>
    <p class="u-text-md u-text-muted">Add your first expense to start tracking your spending.</p>
  `;

  const list = document.createElement('ul');
  list.className = 'expense-list';
  list.id = 'expense-list';

  main.appendChild(header);
  main.appendChild(emptyState);
  main.appendChild(list);
  shell.appendChild(main);
  root.appendChild(shell);

  const modal = buildModal();
  root.appendChild(modal.overlay);

  function createAddExpenseButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.innerHTML = '<span aria-hidden="true">+ </span>Add Expense';
    btn.addEventListener('click', openModal);
    return btn;
  }

  function openModal() {
    lastFocused = document.activeElement;
    modal.overlay.hidden = false;
    modal.amountInput.focus();
  }

  function closeModal() {
    modal.overlay.hidden = true;
    resetForm();
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function resetForm() {
    modal.amountInput.value = '';
    modal.dateInput.value = '';
    modal.categorySelect.value = '';
    modal.descriptionInput.value = '';
    ['amount', 'date', 'category'].forEach((field) => setFieldInvalid(field, false));
  }

  function setFieldInvalid(field, invalid, message) {
    const input = modal.fields[field];
    const error = modal.errors[field];
    if (invalid) {
      input.classList.add('input-invalid');
      input.setAttribute('aria-invalid', 'true');
      error.textContent = `⚠ ${message}`;
    } else {
      input.classList.remove('input-invalid');
      input.removeAttribute('aria-invalid');
      error.textContent = '';
    }
  }

  function updateSummary() {
    if (expenses.length === 0) {
      summary.textContent = 'No expenses recorded yet';
      emptyState.style.display = 'block';
      list.style.display = 'none';
    } else {
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      summary.textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'} · ${formatCurrencyUSD(total)} total`;
      emptyState.style.display = 'none';
      list.style.display = 'flex';
    }
  }

  function renderExpenseRow(expense) {
    const li = document.createElement('li');
    li.className = 'expense-row card';

    const rowMain = document.createElement('div');
    rowMain.className = 'expense-row-main';
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${CATEGORY_ICONS[expense.category] || '🗂️'} ${expense.category}`;
    const desc = document.createElement('span');
    desc.className = 'expense-desc';
    desc.textContent = expense.description || 'No description';
    rowMain.appendChild(chip);
    rowMain.appendChild(desc);

    const rowMeta = document.createElement('div');
    rowMeta.className = 'expense-row-meta';
    const date = document.createElement('span');
    date.className = 'expense-date u-text-sm u-text-muted';
    date.textContent = expense.date;
    const amount = document.createElement('span');
    amount.className = 'expense-amount';
    amount.textContent = formatCurrencyUSD(expense.amount);
    rowMeta.appendChild(date);
    rowMeta.appendChild(amount);

    li.appendChild(rowMain);
    li.appendChild(rowMeta);
    return li;
  }

  function handleSave() {
    const values = {
      amount: modal.amountInput.value,
      date: modal.dateInput.value,
      category: modal.categorySelect.value,
      description: modal.descriptionInput.value,
    };
    const result = validateExpenseForm(values);

    ['amount', 'date', 'category'].forEach((field) => {
      setFieldInvalid(field, Boolean(result.errors[field]), result.errors[field]);
    });

    if (!result.valid) return;

    const expense = {
      amount: parseFloat(values.amount),
      date: values.date,
      category: values.category,
      description: values.description.trim(),
    };
    expenses.unshift(expense);
    list.insertBefore(renderExpenseRow(expense), list.firstChild);
    updateSummary();
    closeModal();
  }

  modal.saveBtn.addEventListener('click', handleSave);
  modal.cancelBtn.addEventListener('click', closeModal);
  modal.closeBtn.addEventListener('click', closeModal);
  modal.overlay.addEventListener('click', (event) => {
    if (event.target === modal.overlay) closeModal();
  });
  modal.overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  updateSummary();

  return { expenses };
}

function buildModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog card';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.id = 'expense-modal-title';
  modalTitle.textContent = 'Add expense';
  overlay.setAttribute('aria-labelledby', modalTitle.id);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  const form = document.createElement('form');
  form.noValidate = true;

  const amountField = buildField('amount-input', 'Amount', 'input', { type: 'number', min: '0', step: '0.01' }, true);
  const amountWrap = document.createElement('div');
  amountWrap.className = 'amount-input-wrap';
  amountField.input.classList.add('amount-input');
  const amountPrefix = document.createElement('span');
  amountPrefix.className = 'amount-prefix';
  amountPrefix.setAttribute('aria-hidden', 'true');
  amountPrefix.textContent = '$';
  amountField.container.insertBefore(amountWrap, amountField.input);
  amountWrap.appendChild(amountPrefix);
  amountWrap.appendChild(amountField.input);

  const dateField = buildField('date-input', 'Date', 'input', { type: 'date' }, true);

  const categoryField = buildSelectField('category-input', 'Category');

  const descriptionField = buildField('description-input', 'Description (optional)', 'textarea', { rows: '3' }, false);

  form.appendChild(amountField.container);
  form.appendChild(dateField.container);
  form.appendChild(categoryField.container);
  form.appendChild(descriptionField.container);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save expense';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  dialog.appendChild(modalHeader);
  dialog.appendChild(form);
  overlay.appendChild(dialog);

  return {
    overlay,
    amountInput: amountField.input,
    dateInput: dateField.input,
    categorySelect: categoryField.select,
    descriptionInput: descriptionField.input,
    saveBtn,
    cancelBtn,
    closeBtn,
    fields: { amount: amountField.input, date: dateField.input, category: categoryField.select },
    errors: { amount: amountField.error, date: dateField.error, category: categoryField.error },
  };
}

function buildField(id, labelText, tag, attrs, required) {
  const container = document.createElement('div');
  container.className = 'form-field';

  const label = document.createElement('label');
  label.className = 'label';
  label.setAttribute('for', id);
  label.textContent = labelText + (required ? ' ' : '');
  if (required) {
    const mark = document.createElement('span');
    mark.className = 'required-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '*';
    label.appendChild(mark);
  }

  const input = document.createElement(tag);
  input.className = 'input';
  input.id = id;
  Object.keys(attrs || {}).forEach((key) => input.setAttribute(key, attrs[key]));

  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `${id}-error`;
  error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', error.id);

  container.appendChild(label);
  container.appendChild(input);
  container.appendChild(error);

  return { container, input, error };
}

function buildSelectField(id, labelText) {
  const container = document.createElement('div');
  container.className = 'form-field';

  const label = document.createElement('label');
  label.className = 'label';
  label.setAttribute('for', id);
  label.textContent = `${labelText} `;
  const mark = document.createElement('span');
  mark.className = 'required-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '*';
  label.appendChild(mark);

  const select = document.createElement('select');
  select.className = 'input';
  select.id = id;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a category';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `${id}-error`;
  error.setAttribute('role', 'alert');
  select.setAttribute('aria-describedby', error.id);

  container.appendChild(label);
  container.appendChild(select);
  container.appendChild(error);

  return { container, select, error };
}

if (typeof module !== 'undefined') {
  module.exports = { renderApp };
}
