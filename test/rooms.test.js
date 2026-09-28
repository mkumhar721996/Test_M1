const request = require('supertest');
const app = require('../src/server');

test('AC1: creating a room assigns it to an existing room type and it appears in the list', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const res = await request(app).post('/rooms').send({ identifier: '101', roomTypeId: roomType.id, actor: 'Priya Nair' });
  expect(res.status).toBe(201);
  expect(res.body.roomTypeId).toBe(roomType.id);
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.find((r) => r.id === res.body.id)).toMatchObject({ identifier: '101', roomTypeId: roomType.id });
});

test('AC2/AC3: a room in maintenance rejects booking requests with a clear reason', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await request(app).post('/rooms').send({ identifier: '202', roomTypeId: roomType.id, actor: 'Priya Nair' });
  const { id } = createRes.body;
  const statusRes = await request(app).patch(`/rooms/${id}/status`).send({ status: 'maintenance', actor: 'Priya Nair' });
  expect(statusRes.status).toBe(200);
  expect(statusRes.body.status).toBe('maintenance');
  const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
  expect(bookingRes.status).toBe(409);
  expect(bookingRes.body.error).toMatch(/unavailable/i);
});

test('AC3: a room out-of-order rejects booking requests', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await request(app).post('/rooms').send({ identifier: '303', roomTypeId: roomType.id, actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).patch(`/rooms/${id}/status`).send({ status: 'out-of-order', actor: 'Priya Nair' });
  const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
  expect(bookingRes.status).toBe(409);
  expect(bookingRes.body.error).toMatch(/out-of-order/);
});

test('AC4: reverting status to available makes the room bookable again', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  const createRes = await request(app).post('/rooms').send({ identifier: '404', roomTypeId: roomType.id, actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).patch(`/rooms/${id}/status`).send({ status: 'maintenance', actor: 'Priya Nair' });
  const revertRes = await request(app).patch(`/rooms/${id}/status`).send({ status: 'available', actor: 'Priya Nair' });
  expect(revertRes.body.status).toBe('available');
  const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
  expect(bookingRes.status).toBe(201);
  expect(bookingRes.body.accepted).toBe(true);
});

test('AC5: creating a room with a duplicate identifier is rejected and not saved', async () => {
  const typesRes = await request(app).get('/room-types');
  const roomType = typesRes.body[0];
  await request(app).post('/rooms').send({ identifier: 'DUP-1', roomTypeId: roomType.id, actor: 'Priya Nair' });
  const dupRes = await request(app).post('/rooms').send({ identifier: 'DUP-1', roomTypeId: roomType.id, actor: 'Priya Nair' });
  expect(dupRes.status).toBe(400);
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.filter((r) => r.identifier === 'DUP-1')).toHaveLength(1);
});

test('AC1 (validation): creating a room with an unknown room type is rejected', async () => {
  const res = await request(app).post('/rooms').send({ identifier: 'ZZZ', roomTypeId: 'rt_nonexistent', actor: 'Priya Nair' });
  expect(res.status).toBe(400);
});

test('booking a room that does not exist returns 404', async () => {
  const res = await request(app).post('/rooms/does-not-exist/booking-requests').send({});
  expect(res.status).toBe(404);
});

test('GET /rooms/statuses exposes the valid status values for the UI to render', async () => {
  const res = await request(app).get('/rooms/statuses');
  expect(res.status).toBe(200);
  expect(res.body.statuses).toEqual(['available', 'maintenance', 'out-of-order']);
});
