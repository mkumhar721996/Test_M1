const request = require('supertest');
const app = require('../src/server');
const { createExpense, clearExpenses } = require('../src/expenses/store');

const AUTH_HEADER = { Authorization: 'Bearer test-user-1' };
const OTHER_AUTH_HEADER = { Authorization: 'Bearer test-user-2' };

beforeEach(() => {
  clearExpenses();
});

test('DELETE without confirm shows a confirmation prompt and does not delete', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

  const res = await request(app).delete(`/expenses/${expense.id}`).set(AUTH_HEADER);

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('confirmation_required');
  expect(res.body.message).toMatch(/permanently/i);

  const listRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(listRes.body.expenses).toEqual([expense]);
});

test('DELETE with confirm=true removes the record from the list', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

  await request(app).delete(`/expenses/${expense.id}`).set(AUTH_HEADER);
  const confirmRes = await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' }).set(AUTH_HEADER);
  expect(confirmRes.status).toBe(204);

  const listRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(listRes.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
});

test('a deleted record remains deleted on subsequent list requests', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });
  await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' }).set(AUTH_HEADER);

  const firstReload = await request(app).get('/expenses').set(AUTH_HEADER);
  const secondReload = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(firstReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
  expect(secondReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
});

test('not confirming leaves the record and the list unchanged', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });

  await request(app).delete(`/expenses/${expense.id}`).set(AUTH_HEADER);

  const listRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(listRes.body.expenses).toEqual([expense]);
});

test('deleting the last record shows the empty state', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });
  await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' }).set(AUTH_HEADER);

  const listRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(listRes.body.expenses).toEqual([]);
  expect(listRes.body.message).toBe('No expenses yet');
});

test('GET /expenses without an Authorization header is rejected', async () => {
  const res = await request(app).get('/expenses');
  expect(res.status).toBe(401);
});

test('DELETE /expenses/:id without an Authorization header is rejected and does not delete', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 5, date: '2026-01-03', category: 'Misc', description: 'Tea' });

  const res = await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });
  expect(res.status).toBe(401);

  const listRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(listRes.body.expenses).toEqual([expense]);
});

test('a user cannot see or delete another user\'s expense', async () => {
  const expense = createExpense({ ownerId: 'test-user-1', amount: 8, date: '2026-01-04', category: 'Food', description: 'Lunch' });

  const otherListRes = await request(app).get('/expenses').set(OTHER_AUTH_HEADER);
  expect(otherListRes.body.expenses).toEqual([]);

  const deleteRes = await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' }).set(OTHER_AUTH_HEADER);
  expect(deleteRes.status).toBe(404);

  const ownerListRes = await request(app).get('/expenses').set(AUTH_HEADER);
  expect(ownerListRes.body.expenses).toEqual([expense]);
});
