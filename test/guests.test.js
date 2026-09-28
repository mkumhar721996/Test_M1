const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');
const { signStaffToken } = require('../src/auth/staffSession');

const frontDeskAuth = `Bearer ${signStaffToken({ staffId: 'staff_front_desk_1', role: 'front_desk' })}`;
const housekeepingAuth = `Bearer ${signStaffToken({ staffId: 'staff_housekeeping_1', role: 'housekeeping' })}`;

afterEach(() => {
  guestsStore.resetStore();
});

test('AC6: POST /guests is denied for a role without permission, same outcome as direct creation, nothing persisted', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('Authorization', housekeepingAuth)
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC6: a token whose own role claim disagrees with the staff directory is denied — role is never trusted from the client', async () => {
  const before = guestsStore.listGuests().length;
  const spoofedAuth = `Bearer ${signStaffToken({ staffId: 'staff_housekeeping_1', role: 'front_desk' })}`;
  const res = await request(app)
    .post('/guests')
    .set('Authorization', spoofedAuth)
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC6: POST /guests is denied when no valid staff session is presented', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('Authorization', 'Bearer not-a-real-token')
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC4: POST /guests returns a structured validation error and persists nothing', async () => {
  const before = guestsStore.listGuests().length;
  const res = await request(app)
    .post('/guests')
    .set('Authorization', frontDeskAuth)
    .send({ name: '' });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
  expect(guestsStore.listGuests().length).toBe(before);
});

test('AC1/AC3: POST /guests creates a profile and returns a stable id', async () => {
  const res = await request(app)
    .post('/guests')
    .set('Authorization', frontDeskAuth)
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
    .set('Authorization', frontDeskAuth);

  expect(res.status).toBe(200);
  expect(res.body.match).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
});

test('AC5: an unexpected store error returns 500 and persists nothing', async () => {
  const before = guestsStore.listGuests().length;
  const spy = jest.spyOn(guestsStore, 'createGuest').mockImplementation(() => { throw new Error('boom'); });

  const res = await request(app)
    .post('/guests')
    .set('Authorization', frontDeskAuth)
    .send({ name: 'Alex Rivera', email: 'alex@example.com' });

  expect(res.status).toBe(500);
  expect(guestsStore.listGuests().length).toBe(before);
  spy.mockRestore();
});
