const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, deactivateHire } = require('../src/hires/store');

const payload = { name: 'Casey Doe', department: 'Sales', role: 'AE', startDate: '2026-10-05' };

let hire;
beforeEach(async () => {
  hire = await createHire(payload);
});

const ENDPOINTS = [
  { name: 'create', build: () => ({ method: 'post', path: '/hires', body: payload }) },
  { name: 'patch', build: (id) => ({ method: 'patch', path: `/hires/${id}`, body: { name: 'X' } }) },
  { name: 'deactivate', build: (id) => ({ method: 'post', path: `/hires/${id}/deactivate`, body: {} }) },
  { name: 'reactivate', build: (id) => ({ method: 'post', path: `/hires/${id}/reactivate`, body: {} }) },
];

test('AC1: HR can create a new-hire profile', async () => {
  const res = await request(app).post('/hires').set('x-staff-role', 'hr').send(payload);
  expect(res.status).toBe(201);
  expect(getHire(res.body.id)).toBeTruthy();
});

test('AC2: manager can edit an existing new-hire profile', async () => {
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'manager').send({ name: 'A B' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('A B');
});

test('AC3: HR can deactivate a new-hire profile', async () => {
  const res = await request(app).post(`/hires/${hire.id}/deactivate`).set('x-staff-role', 'hr').send({});
  expect(res.status).toBe(200);
  expect(res.body.profileStatus).toBe('deactivated');
});

test('AC4: manager can reactivate a deactivated new-hire profile', async () => {
  await deactivateHire(hire.id);
  const res = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'manager').send({});
  expect(res.status).toBe(200);
  expect(res.body.profileStatus).toBe('active');
});

describe.each(ENDPOINTS)('$name', ({ name, build }) => {
  test('AC5: an unrecognized role is forbidden and nothing changes', async () => {
    const before = { ...getHire(hire.id) };
    const { method, path, body } = build(hire.id);
    const res = await request(app)[method](path).set('x-staff-role', 'front_desk').send(body);
    expect(res.status).toBe(403);
    expect(getHire(hire.id)).toEqual(before);
  });

  test('AC5: no x-staff-role header is unauthorized and nothing changes', async () => {
    const before = { ...getHire(hire.id) };
    const { method, path, body } = build(hire.id);
    const res = await request(app)[method](path).send(body);
    expect(res.status).toBe(401);
    expect(getHire(hire.id)).toEqual(before);
  });

  test('edge case: "HR" (wrong case) is forbidden', async () => {
    const { method, path, body } = build(hire.id);
    const res = await request(app)[method](path).set('x-staff-role', 'HR').send(body);
    expect(res.status).toBe(403);
  });
});

test('AC6: reading a profile succeeds with no staff role at all', async () => {
  expect((await request(app).get('/hires')).status).toBe(200);
  expect((await request(app).get(`/hires/${hire.id}`)).status).toBe(200);
});

test('edge case: an explicit unrecognized role can still list and read hires', async () => {
  expect((await request(app).get('/hires').set('x-staff-role', 'front_desk')).status).toBe(200);
  expect((await request(app).get(`/hires/${hire.id}`).set('x-staff-role', 'front_desk')).status).toBe(200);
});

test('edge case: an empty x-staff-role header is unauthorized, not forbidden', async () => {
  const res = await request(app).post('/hires').set('x-staff-role', '').send(payload);
  expect(res.status).toBe(401);
});

test('edge case: an unauthorized role gets 403 even for a hire id that does not exist', async () => {
  const res = await request(app).patch('/hires/does-not-exist').set('x-staff-role', 'front_desk').send({ name: 'X' });
  expect(res.status).toBe(403);
});

test('edge case: a missing role gets 401 even for a hire id that does not exist', async () => {
  const res = await request(app).post('/hires/does-not-exist/deactivate').send({});
  expect(res.status).toBe(401);
});

test('edge case: an authorized create with a missing required field still returns 400', async () => {
  const res = await request(app).post('/hires').set('x-staff-role', 'hr').send({ department: 'Sales', role: 'AE', startDate: '2026-10-05' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { name: 'Full name is required.' } });
});

test('edge case: an unrecognized role is forbidden to reactivate an already-active hire', async () => {
  const res = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'front_desk').send({});
  expect(res.status).toBe(403);
});
