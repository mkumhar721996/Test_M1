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

  const getRes = await request(app).get(`/employees/${id}`).set('x-staff-role', 'hr');
  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual(createRes.body);
});

test('GET /employees lists every employee record created so far', async () => {
  const created = (await request(app).post('/employees').send({ name: 'List Test', email: 'list@example.com', jobTitle: 'QA' })).body;
  const res = await request(app).get('/employees').set('x-staff-role', 'hr');
  expect(res.status).toBe(200);
  expect(res.body.some((e) => e.id === created.id)).toBe(true);
});

test('GET /employees without a staff role is unauthorized', async () => {
  const res = await request(app).get('/employees');
  expect(res.status).toBe(401);
});
