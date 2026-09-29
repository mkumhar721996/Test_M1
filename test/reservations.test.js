const request = require('supertest');
const app = require('../src/server');
const { clearReservations } = require('../src/reservations/store');

beforeEach(() => {
  clearReservations();
});

test('AC6: POST /reservations with x-staff-role housekeeping is denied with 403', async () => {
  const res = await request(app).post('/reservations').set('x-staff-role', 'housekeeping').send({
    guestId: 'gst_1005', roomId: 'room_404', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
  });
  expect(res.status).toBe(403);
});

test('AC1/AC2: POST /reservations with x-staff-role front_desk creates a booked reservation and returns the rate', async () => {
  const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_505', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 130,
  });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'booked', roomRate: 130 });
});

test('AC4: POST /reservations for an overlapping date range on the same room returns 409', async () => {
  await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_606', checkInDate: '2026-11-01', checkOutDate: '2026-11-10', roomRate: 100,
  });
  const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1006', roomId: 'room_606', checkInDate: '2026-11-08', checkOutDate: '2026-11-15', roomRate: 120,
  });
  expect(res.status).toBe(409);
});

test('AC5: POST /reservations with check-in on the prior checkout date is accepted (same-day turnover)', async () => {
  await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_707', checkInDate: '2026-12-01', checkOutDate: '2026-12-04', roomRate: 100,
  });
  const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1006', roomId: 'room_707', checkInDate: '2026-12-04', checkOutDate: '2026-12-08', roomRate: 110,
  });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('booked');
});

test('AC3: PATCH /reservations/:id with a roomRate change is rejected with 400', async () => {
  const createRes = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_808', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
  });
  const patchRes = await request(app).patch(`/reservations/${createRes.body.id}`).set('x-staff-role', 'front_desk').send({ roomRate: 250 });
  expect(patchRes.status).toBe(400);
  const getRes = await request(app).get(`/reservations/${createRes.body.id}`);
  expect(getRes.body.roomRate).toBe(100);
});

test('PATCH /reservations/:id without an x-staff-role header is rejected with 403', async () => {
  const createRes = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_809', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
  });
  const patchRes = await request(app).patch(`/reservations/${createRes.body.id}`).send({ roomRate: 250 });
  expect(patchRes.status).toBe(403);
});

test('POST /reservations ignores a client-supplied actor and derives it from the authenticated staff-role header', async () => {
  const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
    guestId: 'gst_1005', roomId: 'room_910', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
    actor: 'Spoofed Manager',
  });
  expect(res.status).toBe(201);
  expect(res.body.actor).toBe('front_desk');
  expect(res.body.actor).not.toBe('Spoofed Manager');
});

test('GET /reservations/:id for an unknown id returns 404', async () => {
  const res = await request(app).get('/reservations/does-not-exist');
  expect(res.status).toBe(404);
});
