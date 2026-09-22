const request = require('supertest');
const app = require('../src/server');

test('GET /categories/:id with no limit set shows no limit value or warning', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Travel' });
  const { id } = createRes.body;

  const res = await request(app).get(`/categories/${id}`);

  expect(res.status).toBe(200);
  expect(res.body.limit).toBeNull();
  expect(res.body.warning).toBe(false);
  expect(res.body.warningLabel).toBeNull();
});

test('PUT /categories/:id/limit stores a valid limit shown alongside total spend', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Software & Subscriptions' });
  const { id } = createRes.body;
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 742.5 });

  const res = await request(app).put(`/categories/${id}/limit`).send({ limit: 1000 });

  expect(res.status).toBe(200);
  expect(res.body.limit).toBe(1000);
  expect(res.body.totalSpend).toBe(742.5);
});

test.each([
  ['0', 'Spend limit must be greater than $0.'],
  ['-10', 'Spend limit must be greater than $0.'],
  ['abc', 'Enter a valid number, e.g. 500.'],
  ['', 'Enter a spend limit to save.'],
])('PUT /categories/:id/limit rejects %s', async (limit, expectedError) => {
  const createRes = await request(app).post('/categories').send({ name: 'Office Supplies' });
  const { id } = createRes.body;

  const res = await request(app).put(`/categories/${id}/limit`).send({ limit });

  expect(res.status).toBe(400);
  expect(res.body.error).toBe(expectedError);
  const getRes = await request(app).get(`/categories/${id}`);
  expect(getRes.body.limit).toBeNull();
});

test('spend below limit has no warning', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Client Entertainment' });
  const { id } = createRes.body;
  await request(app).put(`/categories/${id}/limit`).send({ limit: 1200 });
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 640 });

  const res = await request(app).get(`/categories/${id}`);

  expect(res.body.warning).toBe(false);
  expect(res.body.totalSpend).toBe(640);
});

test('spend at limit triggers the warning indicator', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Office Supplies' });
  const { id } = createRes.body;
  await request(app).put(`/categories/${id}/limit`).send({ limit: 268 });
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 268 });

  const res = await request(app).get(`/categories/${id}`);

  expect(res.body.warning).toBe(true);
  expect(res.body.warningLabel).toBe('At limit');
});

test('DELETE /categories/:id/limit clears limit and warning', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Travel' });
  const { id } = createRes.body;
  await request(app).put(`/categories/${id}/limit`).send({ limit: 100 });
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 150 });

  await request(app).delete(`/categories/${id}/limit`);
  const res = await request(app).get(`/categories/${id}`);

  expect(res.body.limit).toBeNull();
  expect(res.body.warning).toBe(false);
});

test('total spend reflects all expenses recorded so far on each fetch', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Team Meals' });
  const { id } = createRes.body;
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 210 });

  const first = await request(app).get(`/categories/${id}`);
  expect(first.body.totalSpend).toBe(210);

  await request(app).post(`/categories/${id}/expenses`).send({ amount: 120 });
  const second = await request(app).get(`/categories/${id}`);
  expect(second.body.totalSpend).toBe(330);
});

test('warning state reflects all expenses recorded so far on each fetch', async () => {
  const createRes = await request(app).post('/categories').send({ name: 'Team Meals' });
  const { id } = createRes.body;
  await request(app).put(`/categories/${id}/limit`).send({ limit: 300 });
  await request(app).post(`/categories/${id}/expenses`).send({ amount: 210 });

  const first = await request(app).get(`/categories/${id}`);
  expect(first.body.warning).toBe(false);

  await request(app).post(`/categories/${id}/expenses`).send({ amount: 120 });
  const second = await request(app).get(`/categories/${id}`);
  expect(second.body.warning).toBe(true);
  expect(second.body.warningLabel).toBe('Over limit');
});
