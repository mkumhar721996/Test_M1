const request = require('supertest');
const app = require('../src/server');

test('POST /employees creates and persists a new employee record', async () => {
  const payload = { name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer' };
  const res = await request(app).post('/employees').send(payload);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject(payload);
  expect(res.body.id).toBeDefined();
});

test('GET /employees/:id returns the employee information unchanged', async () => {
  const payload = { name: 'Grace Hopper', email: 'grace@example.com', jobTitle: 'Rear Admiral' };
  const createRes = await request(app).post('/employees').send(payload);
  const { id } = createRes.body;

  const getRes = await request(app).get(`/employees/${id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual(createRes.body);
});

test('AC3: a SQLite failure on POST /employees responds with an HTTP error status', async () => {
  const { getDb } = require('../src/db/connection');
  const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => {
    throw new Error('SQLITE_IOERR: disk I/O error');
  });

  const res = await request(app).post('/employees').send({ name: 'A', email: 'a@x.com', jobTitle: 'Eng' });
  expect(res.status).toBe(500);

  prepareSpy.mockRestore();
});
