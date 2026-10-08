const request = require('supertest');
const app = require('../src/server');
const { getLatestVersion } = require('../src/workflows/store');

const validTaskGraph = { tasks: [{ id: 't1', next: [] }] };

async function seed() {
  const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: validTaskGraph });
  return created.body.id;
}

test('AC11: a missing role is rejected with 401 on create', async () => {
  const res = await request(app).post('/workflows').send({ taskGraph: validTaskGraph });
  expect(res.status).toBe(401);
});

test('AC11: a non-permitted role cannot create a workflow', async () => {
  const res = await request(app).post('/workflows').set('x-staff-role', 'manager').send({ taskGraph: validTaskGraph });
  expect(res.status).toBe(403);
});

test('AC11: a non-permitted role cannot save a new version', async () => {
  const id = await seed();
  const res = await request(app).post(`/workflows/${id}/versions`).set('x-staff-role', 'manager').send({ taskGraph: validTaskGraph });
  expect(res.status).toBe(403);
  expect(getLatestVersion(id).version).toBe(1);
});

test('AC11: platform admin may save', async () => {
  const id = await seed();
  const res = await request(app).post(`/workflows/${id}/versions`).set('x-staff-role', 'platform_admin').send({ taskGraph: validTaskGraph });
  expect(res.status).toBe(201);
  expect(res.body.savedBy).toBe('Platform Admin');
});

test('AC8: the audit actor comes from the authenticated role, never the request body', async () => {
  const res = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: validTaskGraph, savedBy: 'Mallory' });
  expect(res.body.savedBy).toBe('HR Coordinator');
});
