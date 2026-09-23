/** @jest-environment jsdom */
const { getByRole, getByLabelText, queryByText, getAllByRole, fireEvent } = require('@testing-library/dom');
const { renderApp } = require('../public/app');

function setup() {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root');
  renderApp(root);
  return root;
}

beforeEach(() => localStorage.clear());

test('AC1: Add Expense button opens a modal with amount, date, category, and description fields', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  expect(modal.hidden).toBe(false);
  expect(getByLabelText(modal, 'Amount', { exact: false })).toBeTruthy();
  expect(getByLabelText(modal, 'Date', { exact: false })).toBeTruthy();
  const category = getByLabelText(modal, 'Category', { exact: false });
  expect(Array.from(category.options).map((o) => o.value).filter(Boolean)).toEqual([
    'Food',
    'Transport',
    'Housing',
    'Entertainment',
    'Other',
  ]);
  expect(getByLabelText(modal, 'Description (optional)')).toBeTruthy();
});

test('AC1: the dialog role, aria-modal, and aria-labelledby live on the dialog card, not the backdrop', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  expect(modal.classList.contains('modal-dialog')).toBe(true);
  expect(modal.classList.contains('modal-overlay')).toBe(false);
  expect(modal.getAttribute('aria-modal')).toBe('true');
  const labelledBy = modal.getAttribute('aria-labelledby');
  expect(modal.querySelector(`#${labelledBy}`)).toBeTruthy();
});

test('ACs 2-4: submitting with required fields empty keeps the modal open, marks fields invalid, and shows inline errors', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  expect(modal.hidden).toBe(false);
  expect(getByLabelText(modal, 'Amount', { exact: false }).classList.contains('input-invalid')).toBe(true);
  expect(getByLabelText(modal, 'Date', { exact: false }).classList.contains('input-invalid')).toBe(true);
  expect(getByLabelText(modal, 'Category', { exact: false }).classList.contains('input-invalid')).toBe(true);
  expect(queryByText(modal, /Amount is required\./)).toBeTruthy();
  expect(queryByText(modal, /Date is required\./)).toBeTruthy();
  expect(queryByText(modal, /Category is required\./)).toBeTruthy();
});

test('ACs 5, 6, 8: a valid submit closes the modal and prepends a USD-formatted expense to the list', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '42.5' } });
  fireEvent.change(getByLabelText(modal, 'Date', { exact: false }), { target: { value: '2026-09-21' } });
  fireEvent.change(getByLabelText(modal, 'Category', { exact: false }), { target: { value: 'Food' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  expect(modal.hidden).toBe(true);
  const items = getAllByRole(root, 'listitem');
  expect(items[0].textContent).toContain('$42.50');
  expect(items[0].textContent).toContain('Food');
});

test('AC6: a second valid expense is prepended above the first', () => {
  const root = setup();

  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  let modal = getByRole(root, 'dialog');
  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '10' } });
  fireEvent.change(getByLabelText(modal, 'Date', { exact: false }), { target: { value: '2026-09-01' } });
  fireEvent.change(getByLabelText(modal, 'Category', { exact: false }), { target: { value: 'Other' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  modal = getByRole(root, 'dialog');
  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '20' } });
  fireEvent.change(getByLabelText(modal, 'Date', { exact: false }), { target: { value: '2026-09-02' } });
  fireEvent.change(getByLabelText(modal, 'Category', { exact: false }), { target: { value: 'Transport' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  const items = getAllByRole(root, 'listitem');
  expect(items[0].textContent).toContain('$20.00');
  expect(items[1].textContent).toContain('$10.00');
});

test('AC7: cancelling the modal creates no expense', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '42.5' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Cancel' }));

  expect(modal.hidden).toBe(true);
  expect(root.querySelectorAll('#expense-list li').length).toBe(0);
});

test('AC7: dismissing the modal via the close button creates no expense', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  const modal = getByRole(root, 'dialog');

  fireEvent.click(getByRole(modal, 'button', { name: 'Close' }));

  expect(modal.hidden).toBe(true);
  expect(root.querySelectorAll('#expense-list li').length).toBe(0);
});

test('List AC1/AC2: with no stored expenses, the list area shows "No expenses yet" and a prompt to add the first expense', () => {
  const root = setup();

  expect(queryByText(root, 'No expenses yet')).toBeTruthy();
  const prompt = getByRole(root, 'button', { name: /Add your first expense/ });
  expect(prompt).toBeTruthy();
  expect(root.querySelectorAll('#expense-list li').length).toBe(0);
});

test('List AC3: a stored expense is rendered with its amount, date, category, and description', () => {
  localStorage.setItem('expenses', JSON.stringify([
    { amount: 128.4, date: '2026-09-17', category: 'Housing', description: 'Monthly rent' },
  ]));
  const root = setup();

  const items = getAllByRole(root, 'listitem');
  expect(items).toHaveLength(1);
  expect(items[0].textContent).toContain('$128.40');
  expect(items[0].textContent).toContain('Housing');
  expect(items[0].textContent).toContain('Monthly rent');
  expect(items[0].textContent).toContain('Sep 17, 2026');
});

test('List AC4: multiple stored expenses render in most-recently-added-first order', () => {
  localStorage.setItem('expenses', JSON.stringify([
    { amount: 20, date: '2026-09-02', category: 'Transport', description: 'newest' },
    { amount: 10, date: '2026-09-01', category: 'Other', description: 'oldest' },
  ]));
  const root = setup();

  const items = getAllByRole(root, 'listitem');
  expect(items[0].textContent).toContain('newest');
  expect(items[1].textContent).toContain('oldest');
});

test('List AC5: expenses added in one session reappear in the same order after reloading against the same storage', () => {
  const root = setup();
  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  let modal = getByRole(root, 'dialog');
  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '10' } });
  fireEvent.change(getByLabelText(modal, 'Date', { exact: false }), { target: { value: '2026-09-01' } });
  fireEvent.change(getByLabelText(modal, 'Category', { exact: false }), { target: { value: 'Other' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
  modal = getByRole(root, 'dialog');
  fireEvent.change(getByLabelText(modal, 'Amount', { exact: false }), { target: { value: '20' } });
  fireEvent.change(getByLabelText(modal, 'Date', { exact: false }), { target: { value: '2026-09-02' } });
  fireEvent.change(getByLabelText(modal, 'Category', { exact: false }), { target: { value: 'Transport' } });
  fireEvent.click(getByRole(modal, 'button', { name: 'Save expense' }));

  // simulate refreshing the page: re-render against the same localStorage
  const reloadedRoot = setup();
  const items = getAllByRole(reloadedRoot, 'listitem');
  expect(items[0].textContent).toContain('$20.00');
  expect(items[1].textContent).toContain('$10.00');
});
