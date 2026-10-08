const request = require('supertest');
const app = require('../src/server');

const put = (id, available) => request(app).put('/availability/me').set('x-user-id', id).send({ available });
const roster = () => request(app).get('/availability').set('x-staff-role', 'dispatcher');

test('AC1: marking unavailable is reflected in the dispatcher roster view', async () => {
  await put('marcus-webb', false);
  const res = await roster();
  expect(res.status).toBe(200);
  expect(res.body.find((r) => r.technicianId === 'marcus-webb')).toMatchObject({ available: false });
});

test('AC2: marking available again is reflected in the dispatcher roster view', async () => {
  await put('marcus-webb', false);
  await put('marcus-webb', true);
  const res = await roster();
  expect(res.body.find((r) => r.technicianId === 'marcus-webb')).toMatchObject({ available: true });
});

test('AC3: existing job assignments are unchanged when the technician marks unavailable', async () => {
  const before = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
  await put('marcus-webb', false);
  const after = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
  expect(after.body).toEqual(before.body);
});

test('AC4: a dispatcher can assign a new job to an unavailable technician', async () => {
  await put('dana-cole', false);
  const res = await request(app).post('/jobs/JOB-9002/assign').set('x-staff-role', 'dispatcher').send({ technicianId: 'dana-cole' });
  expect(res.status).toBe(200);
  expect(res.body.technicianId).toBe('dana-cole');
});

test('GET /availability/me defaults to available and requires identity', async () => {
  const res = await request(app).get('/availability/me').set('x-user-id', 'new-tech');
  expect(res.body).toMatchObject({ technicianId: 'new-tech', available: true });
  expect((await request(app).get('/availability/me')).status).toBe(401);
});

test('PUT /availability/me rejects a non-boolean value', async () => {
  const res = await put('marcus-webb', 'no');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
});

test('roster requires the dispatcher role; assign validates input', async () => {
  expect((await request(app).get('/availability')).status).toBe(401);
  expect((await request(app).get('/availability').set('x-staff-role', 'tech')).status).toBe(403);
  const a = (id, body) => request(app).post(`/jobs/${id}/assign`).set('x-staff-role', 'dispatcher').send(body);
  expect((await a('JOB-9002', {})).status).toBe(400);
  expect((await a('NOPE', { technicianId: 'x' })).status).toBe(404);
  expect((await request(app).post('/jobs/JOB-9002/assign').send({ technicianId: 'x' })).status).toBe(401);
});
