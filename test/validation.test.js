const { validateExpenseForm } = require('../public/validation');

test('flags amount, date, and category as invalid when empty', () => {
  const result = validateExpenseForm({ amount: '', date: '', category: '', description: '' });
  expect(result.valid).toBe(false);
  expect(result.errors.amount).toBe('Amount is required.');
  expect(result.errors.date).toBe('Date is required.');
  expect(result.errors.category).toBe('Category is required.');
});

test('is valid when amount, date, and category are provided', () => {
  const result = validateExpenseForm({ amount: '25.00', date: '2026-09-21', category: 'Food', description: '' });
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual({});
});

test('does not require description', () => {
  const result = validateExpenseForm({ amount: '25.00', date: '2026-09-21', category: 'Food' });
  expect(result.valid).toBe(true);
});
