const request = require('supertest');
const app = require('../src/server');
const { STAFF_TOKEN } = require('../src/rooms/auth');

function staff(req) {
  return req.set('X-Staff-Token', STAFF_TOKEN);
}

test('AC1: creating a room assigns it to an existing room type and it appears in the list', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const res = await staff(request(app).post('/rooms')).send({ identifier: '101', roomTypeId: roomType.id });
  expect(res.status).toBe(201);
  expect(res.body.roomTypeId).toBe(roomType.id);
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.find((r) => r.id === res.body.id)).toMatchObject({ identifier: '101', roomTypeId: roomType.id });
});

test('AC2/AC3: a room in maintenance rejects booking requests with a clear reason', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await staff(request(app).post('/rooms')).send({ identifier: '202', roomTypeId: roomType.id });
  const { id } = createRes.body;
  const statusRes = await staff(request(app).patch(`/rooms/${id}/status`)).send({ status: 'maintenance' });
  expect(statusRes.status).toBe(200);
  expect(statusRes.body.status).toBe('maintenance');
  const bookingRes = await staff(request(app).post(`/rooms/${id}/booking-requests`)).send({});
  expect(bookingRes.status).toBe(409);
  expect(bookingRes.body.error).toMatch(/unavailable/i);
});

test('AC3: a room out-of-order rejects booking requests', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await staff(request(app).post('/rooms')).send({ identifier: '303', roomTypeId: roomType.id });
  const { id } = createRes.body;
  await staff(request(app).patch(`/rooms/${id}/status`)).send({ status: 'out-of-order' });
  const bookingRes = await staff(request(app).post(`/rooms/${id}/booking-requests`)).send({});
  expect(bookingRes.status).toBe(409);
  expect(bookingRes.body.error).toMatch(/out-of-order/);
});

test('AC4: reverting status to available makes the room bookable again', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await staff(request(app).post('/rooms')).send({ identifier: '404', roomTypeId: roomType.id });
  const { id } = createRes.body;
  await staff(request(app).patch(`/rooms/${id}/status`)).send({ status: 'maintenance' });
  const revertRes = await staff(request(app).patch(`/rooms/${id}/status`)).send({ status: 'available' });
  expect(revertRes.body.status).toBe('available');
  const bookingRes = await staff(request(app).post(`/rooms/${id}/booking-requests`)).send({});
  expect(bookingRes.status).toBe(201);
  expect(bookingRes.body.accepted).toBe(true);
});

test('AC5: creating a room with a duplicate identifier is rejected and not saved', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  await staff(request(app).post('/rooms')).send({ identifier: 'DUP-1', roomTypeId: roomType.id });
  const dupRes = await staff(request(app).post('/rooms')).send({ identifier: 'DUP-1', roomTypeId: roomType.id });
  expect(dupRes.status).toBe(400);
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.filter((r) => r.identifier === 'DUP-1')).toHaveLength(1);
});

test('AC1 (validation): creating a room with an unknown room type is rejected', async () => {
  const res = await staff(request(app).post('/rooms')).send({ identifier: 'ZZZ', roomTypeId: 'rt_nonexistent' });
  expect(res.status).toBe(400);
});

test('booking a room that does not exist returns 404', async () => {
  const res = await staff(request(app).post('/rooms/does-not-exist/booking-requests')).send({});
  expect(res.status).toBe(404);
});

test('GET /rooms/statuses exposes the valid status values for the UI to render', async () => {
  const res = await request(app).get('/rooms/statuses');
  expect(res.status).toBe(200);
  expect(res.body.statuses).toEqual(['available', 'maintenance', 'out-of-order']);
});

test('security: creating a room without the staff token is rejected and not saved', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const res = await request(app).post('/rooms').send({ identifier: 'NOAUTH-1', roomTypeId: roomType.id });
  expect(res.status).toBe(401);
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.find((r) => r.identifier === 'NOAUTH-1')).toBeUndefined();
});

test('security: changing a room status without the staff token is rejected', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await staff(request(app).post('/rooms')).send({ identifier: 'NOAUTH-2', roomTypeId: roomType.id });
  const { id } = createRes.body;
  const res = await request(app).patch(`/rooms/${id}/status`).send({ status: 'maintenance' });
  expect(res.status).toBe(401);
});

test('security: requesting a booking without the staff token is rejected', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await staff(request(app).post('/rooms')).send({ identifier: 'NOAUTH-3', roomTypeId: roomType.id });
  const { id } = createRes.body;
  const res = await request(app).post(`/rooms/${id}/booking-requests`).send({});
  expect(res.status).toBe(401);
});

test('security: a spoofed actor in the request body is ignored in favor of the authenticated staff identity', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const res = await staff(request(app).post('/rooms')).send({ identifier: 'SPOOF-1', roomTypeId: roomType.id, actor: 'Someone Else' });
  expect(res.status).toBe(201);
  expect(res.body.auditLog[0].actor).toBe('Priya Nair');
});
