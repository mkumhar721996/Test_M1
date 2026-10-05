const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, listHires } = require('../src/hires/store');

const payload = { name: 'X', department: 'Sales', role: 'AE', startDate: '2026-01-01' };

function seedHire(overrides = {}) {
  return createHire({ name: 'A', department: 'Sales', role: 'AE', startDate: '2026-01-01', ...overrides });
}

test('AC1: a non-HR/Manager role creating a profile gets 403 and nothing is created', async () => {
  const before = listHires().length;
  const res = await request(app).post('/hires').set('x-staff-role', 'front_desk').send(payload);
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(listHires().length).toBe(before);
});

test('AC1: no x-staff-role header at all is 401 and nothing is created', async () => {
  const before = listHires().length;
  const res = await request(app).post('/hires').send(payload);
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'unauthorized' });
  expect(listHires().length).toBe(before);
});

test.each(['hr', 'manager'])('AC2: role "%s" is permitted to create', async (role) => {
  const res = await request(app).post('/hires').set('x-staff-role', role).send(payload);
  expect(res.status).toBe(201);
});

test('AC5: a non-HR/Manager role editing a profile gets 403 and the profile is unchanged', async () => {
  const hire = await seedHire();
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'front_desk').send({ name: 'Changed' });
  expect(res.status).toBe(403);
  expect(getHire(hire.id).name).toBe('A');
});

test.each(['deactivate', 'reactivate'])('AC6: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
  const hire = await seedHire({ hireStage: 'offer_accepted' });
  const before = getHire(hire.id).profileStatus;
  const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
  expect(res.status).toBe(403);
  expect(getHire(hire.id).profileStatus).toBe(before);
});

test.each(['deactivate', 'reactivate'])('AC6: no role header on %s is 401', async (action) => {
  const hire = await seedHire({ hireStage: 'offer_accepted' });
  const res = await request(app).post(`/hires/${hire.id}/${action}`).send({});
  expect(res.status).toBe(401);
});

test('AC9: there is no delete route for a hire profile', async () => {
  const hire = await seedHire();
  const res = await request(app).delete(`/hires/${hire.id}`).set('x-staff-role', 'manager');
  expect(res.status).toBe(404);
  expect(getHire(hire.id)).toBeTruthy();
});
