const request = require('supertest');
const app = require('../src/server');

test('POST /hires creates a profile and triggers a Run when hireStage is offer_accepted', async () => {
  const payload = {
    name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '(312) 555-0148',
    startDate: '2026-10-05', department: 'Engineering', role: 'Software Engineer II',
    hireStage: 'offer_accepted',
  };
  const res = await request(app).post('/hires').send(payload);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject(payload);
  expect(res.body.run).toMatchObject({ status: 'active', department: 'Engineering', role: 'Software Engineer II' });
});

test('GET /hires/:id returns the created hire unchanged', async () => {
  const payload = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' };
  const createRes = await request(app).post('/hires').send(payload);
  const { id } = createRes.body;

  const getRes = await request(app).get(`/hires/${id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual(createRes.body);
});

test('GET /hires/:id returns 404 for an unknown id', async () => {
  const res = await request(app).get('/hires/does-not-exist');
  expect(res.status).toBe(404);
});

test('PATCH /hires/:id applies profile changes and returns the updated hire', async () => {
  const payload = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' };
  const createRes = await request(app).post('/hires').send(payload);
  const { id } = createRes.body;

  const patchRes = await request(app).patch(`/hires/${id}`).send({ name: 'A B' });
  expect(patchRes.status).toBe(200);
  expect(patchRes.body.name).toBe('A B');
});

test('POST /hires/:id/deactivate then /reactivate starts a fresh Run', async () => {
  const payload = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'offer_accepted' };
  const createRes = await request(app).post('/hires').send(payload);
  const { id } = createRes.body;

  const deactivateRes = await request(app).post(`/hires/${id}/deactivate`);
  expect(deactivateRes.status).toBe(200);
  expect(deactivateRes.body.profileStatus).toBe('deactivated');
  expect(deactivateRes.body.run).toBeNull();

  const reactivateRes = await request(app).post(`/hires/${id}/reactivate`);
  expect(reactivateRes.status).toBe(200);
  expect(reactivateRes.body.run).toMatchObject({ status: 'active', freshStart: true });
});
