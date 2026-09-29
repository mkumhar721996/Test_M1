const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');

test('AC9: GET /guests/permission reflects canCreateGuest for the given role', async () => {
  const allowed = await request(app).get('/guests/permission').set('x-staff-role', 'front_desk');
  expect(allowed.status).toBe(200);
  expect(allowed.body).toEqual({ allowed: true });

  const denied = await request(app).get('/guests/permission').set('x-staff-role', 'housekeeping');
  expect(denied.status).toBe(200);
  expect(denied.body).toEqual({ allowed: false });
});

test('AC9: GET /guests/permission fails closed when the role header is missing', async () => {
  const res = await request(app).get('/guests/permission');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ allowed: false });
});

test('AC2: GET /guests/match finds a seeded profile by email for an authorized role', async () => {
  const res = await request(app)
    .get('/guests/match')
    .query({ email: 'jordan.lee@example.com' })
    .set('x-staff-role', 'front_desk');

  expect(res.status).toBe(200);
  expect(res.body.match).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
});

test('AC9: GET /guests/match is denied for a role without permission', async () => {
  const res = await request(app)
    .get('/guests/match')
    .query({ email: 'jordan.lee@example.com' })
    .set('x-staff-role', 'housekeeping');

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
});

test('AC9/AC10/AC11: POST /guests is denied for a role without permission, same outcome as direct creation, nothing persisted', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'housekeeping')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC5: POST /guests returns 401 for a caller with no x-staff-role header', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .send({ name: 'Legacy Caller', email: 'legacy@example.com' });

  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'unauthorized' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC5/AC6: POST /guests returns a structured validation error and persists nothing', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: '' });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC1/AC4: POST /guests creates a profile and returns a stable id', async () => {
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Alex Rivera', email: 'alex@example.com' });
  expect(res.body.id).toBeTruthy();
  expect(guestsStore.getGuest(res.body.id)).toMatchObject({ id: res.body.id, name: 'Alex Rivera' });
});

test('PATCH /guests/:id returns the same structured validation error format as POST /guests', async () => {
  const createRes = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });
  const { id } = createRes.body;

  const res = await request(app)
    .patch(`/guests/${id}`)
    .send({ name: '', email: '', phone: '' });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
});

test('AC7/AC8: an unexpected store error returns 500 and persists nothing', async () => {
  const before = guestsStore.listGuests().length;
  const spy = jest.spyOn(guestsStore, 'createGuest').mockImplementation(() => { throw new Error('boom'); });

  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(500);
  expect(guestsStore.listGuests().length).toBe(before);
  spy.mockRestore();
});
