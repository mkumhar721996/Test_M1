const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');

test('AC6: canCreateGuest denies housekeeping and allows front_desk', () => {
  expect(guestsStore.canCreateGuest('housekeeping')).toBe(false);
  expect(guestsStore.canCreateGuest('front_desk')).toBe(true);
});

test('AC6: POST /guests is denied for a role without permission, same outcome as direct creation, nothing persisted', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'housekeeping')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC4: POST /guests returns a structured validation error and persists nothing', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: '' });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC1/AC3: POST /guests creates a profile and returns a stable id', async () => {
  const res = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Alex Rivera', email: 'alex@example.com' });
  expect(res.body.id).toBeTruthy();
  expect(guestsStore.getGuest(res.body.id)).toMatchObject({ id: res.body.id, name: 'Alex Rivera' });
});

test('AC2: GET /guests/match finds a seeded profile by email', async () => {
  const res = await request(app)
    .get('/guests/match')
    .query({ email: 'jordan.lee@example.com' })
    .set('x-staff-role', 'front_desk');

  expect(res.status).toBe(200);
  expect(res.body.match).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
});

test('AC5: an unexpected store error returns 500 and persists nothing', async () => {
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
