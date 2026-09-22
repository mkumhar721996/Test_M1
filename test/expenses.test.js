const request = require('supertest');
const app = require('../src/server');
const { createExpense, clearExpenses } = require('../src/expenses/store');

beforeEach(() => {
  clearExpenses();
});

test('DELETE without confirm shows a confirmation prompt and does not delete', async () => {
  const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

  const res = await request(app).delete(`/expenses/${expense.id}`);

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('confirmation_required');
  expect(res.body.message).toMatch(/permanently/i);

  const listRes = await request(app).get('/expenses');
  expect(listRes.body.expenses).toEqual([expense]);
});

test('DELETE with confirm=true removes the record from the list', async () => {
  const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

  await request(app).delete(`/expenses/${expense.id}`);
  const confirmRes = await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });
  expect(confirmRes.status).toBe(204);

  const listRes = await request(app).get('/expenses');
  expect(listRes.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
});

test('a deleted record remains deleted on subsequent list requests', async () => {
  const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });
  await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });

  const firstReload = await request(app).get('/expenses');
  const secondReload = await request(app).get('/expenses');
  expect(firstReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
  expect(secondReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
});

test('not confirming leaves the record and the list unchanged', async () => {
  const expense = createExpense({ amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });

  await request(app).delete(`/expenses/${expense.id}`);

  const listRes = await request(app).get('/expenses');
  expect(listRes.body.expenses).toEqual([expense]);
});

test('deleting the last record shows the empty state', async () => {
  const expense = createExpense({ amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });
  await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });

  const listRes = await request(app).get('/expenses');
  expect(listRes.body.expenses).toEqual([]);
  expect(listRes.body.message).toBe('No expenses yet');
});
