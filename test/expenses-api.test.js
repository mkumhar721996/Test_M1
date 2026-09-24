const request = require('supertest');
const app = require('../src/server');

test('AC1: a created expense is returned by a subsequent GET /api/expenses', async () => {
  const payload = { date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 };
  const created = await request(app).post('/api/expenses').send(payload);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject(payload);
  expect(created.body.id).toBeDefined();

  const list = await request(app).get('/api/expenses');
  expect(list.status).toBe(200);
  expect(list.body).toContainEqual(created.body);
});

test('PATCH /api/expenses/:id updates and persists the changed fields', async () => {
  const created = await request(app).post('/api/expenses').send({ date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 });
  const patched = await request(app).patch(`/api/expenses/${created.body.id}`).send({ amount: 99.99 });
  expect(patched.status).toBe(200);
  expect(patched.body.amount).toBe(99.99);
  expect(patched.body.description).toBe('Taxi');
});

test('PATCH /api/expenses/:id for an unknown id responds 404', async () => {
  const res = await request(app).patch('/api/expenses/exp_does-not-exist').send({ amount: 1 });
  expect(res.status).toBe(404);
});

test('AC3: a SQLite failure on GET /api/expenses responds with an HTTP error status', async () => {
  const { getDb } = require('../src/db/connection');
  const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => {
    throw new Error('SQLITE_IOERR: disk I/O error');
  });

  const res = await request(app).get('/api/expenses');
  expect(res.status).toBe(500);

  prepareSpy.mockRestore();
});

test('AC3: a SQLite failure on POST /api/expenses responds with an HTTP error status', async () => {
  const { getDb } = require('../src/db/connection');
  const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => {
    throw new Error('SQLITE_IOERR: disk I/O error');
  });

  const res = await request(app).post('/api/expenses').send({ date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 });
  expect(res.status).toBe(500);

  prepareSpy.mockRestore();
});

test('AC3: a SQLite failure on PATCH /api/expenses/:id responds with an HTTP error status', async () => {
  const created = await request(app).post('/api/expenses').send({ date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 });
  const { getDb } = require('../src/db/connection');
  const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => {
    throw new Error('SQLITE_IOERR: disk I/O error');
  });

  const res = await request(app).patch(`/api/expenses/${created.body.id}`).send({ amount: 1 });
  expect(res.status).toBe(500);

  prepareSpy.mockRestore();
});
