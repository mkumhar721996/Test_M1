const request = require('supertest');
const app = require('../src/server');
const expenseStore = require('../src/expenses/store');
const categoryStore = require('../src/categories/store');

beforeEach(() => {
  categoryStore.reset();
  expenseStore.reset();
});

test('POST /categories creates a category with a unique name', async () => {
  const res = await request(app).post('/categories').send({ name: 'Travel' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Travel', expenseCount: 0 });
  expect(res.body.id).toBeDefined();
});

test('POST /categories rejects a case-insensitive duplicate name', async () => {
  await request(app).post('/categories').send({ name: 'Utilities' });
  const res = await request(app).post('/categories').send({ name: 'utilities' });
  expect(res.status).toBe(422);
  expect(res.body.error).toBe('duplicate_name');
});

test('PATCH /categories/:id renames a category to a unique name', async () => {
  const created = await request(app).post('/categories').send({ name: 'Misc' });
  const res = await request(app)
    .patch(`/categories/${created.body.id}`)
    .send({ name: 'Miscellaneous' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Miscellaneous');
});

test('PATCH /categories/:id rejects a case-insensitive duplicate name', async () => {
  const a = await request(app).post('/categories').send({ name: 'Rent' });
  await request(app).post('/categories').send({ name: 'Insurance' });
  const res = await request(app).patch(`/categories/${a.body.id}`).send({ name: 'insurance' });
  expect(res.status).toBe(422);
  expect(res.body.error).toBe('duplicate_name');
});

test('DELETE /categories/:id removes a category with no assigned expenses', async () => {
  const created = await request(app).post('/categories').send({ name: 'Office Supplies' });
  const res = await request(app).delete(`/categories/${created.body.id}`);
  expect(res.status).toBe(200);
  expect(res.body.deleted).toBe(true);
});

test('DELETE /categories/:id requires a resolution when expenses are assigned', async () => {
  const created = await request(app).post('/categories').send({ name: 'Groceries' });
  expenseStore.createExpense({ categoryId: created.body.id });
  const res = await request(app).delete(`/categories/${created.body.id}`);
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ error: 'resolution_required', expenseCount: 1 });
});

test('DELETE with resolution=reassign moves expenses to the target category', async () => {
  const from = await request(app).post('/categories').send({ name: 'Travel Costs' });
  const to = await request(app).post('/categories').send({ name: 'Transport' });
  expenseStore.createExpense({ categoryId: from.body.id });
  expenseStore.createExpense({ categoryId: from.body.id });
  const res = await request(app)
    .delete(`/categories/${from.body.id}`)
    .send({ resolution: 'reassign', targetCategoryId: to.body.id });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ deleted: true, reassignedCount: 2 });
  expect(expenseStore.countByCategory(to.body.id)).toBe(2);
});

test('DELETE with resolution=uncategorise clears the category on assigned expenses', async () => {
  const created = await request(app).post('/categories').send({ name: 'Entertainment' });
  expenseStore.createExpense({ categoryId: created.body.id });
  const res = await request(app)
    .delete(`/categories/${created.body.id}`)
    .send({ resolution: 'uncategorise' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ deleted: true, uncategorisedCount: 1 });
  expect(expenseStore.countByCategory(created.body.id)).toBe(0);
});

test('deleted category no longer appears in GET /categories', async () => {
  const created = await request(app).post('/categories').send({ name: 'Temp' });
  await request(app).delete(`/categories/${created.body.id}`);
  const res = await request(app).get('/categories');
  expect(res.body.categories.find((c) => c.id === created.body.id)).toBeUndefined();
});
