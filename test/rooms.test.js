const request = require('supertest');
const app = require('../src/server');

test('AC1: POST /rooms creates a room under an existing room type', async () => {
  const typesRes = await request(app).get('/rooms/room-types');
  const roomTypeId = typesRes.body[0].id;
  const res = await request(app).post('/rooms').send({ identifier: '204', roomTypeId, actor: 'Priya Nair' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ identifier: '204', roomTypeId, status: 'available' });
  const listRes = await request(app).get('/rooms');
  expect(listRes.body.find((r) => r.id === res.body.id)).toBeDefined();
});

test('AC2: PATCH /rooms/:id/status sets the room to out-of-order', async () => {
  const typesRes = await request(app).get('/rooms/room-types');
  const createRes = await request(app).post('/rooms').send({ identifier: '405', roomTypeId: typesRes.body[0].id });
  const res = await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'out-of-order' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('out-of-order');
});

test('AC3: a booking request against a maintenance room is rejected with a clear reason', async () => {
  const typesRes = await request(app).get('/rooms/room-types');
  const createRes = await request(app).post('/rooms').send({ identifier: '410', roomTypeId: typesRes.body[0].id });
  await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'maintenance' });
  const res = await request(app).post(`/rooms/${createRes.body.id}/booking-requests`).send({});
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('room_unavailable');
  expect(res.body.reason).toEqual(expect.stringContaining('410'));
});

test('AC4: a room set back to available accepts a booking request', async () => {
  const typesRes = await request(app).get('/rooms/room-types');
  const createRes = await request(app).post('/rooms').send({ identifier: '411', roomTypeId: typesRes.body[0].id });
  await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'maintenance' });
  await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'available' });
  const res = await request(app).post(`/rooms/${createRes.body.id}/booking-requests`).send({});
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ roomId: createRes.body.id, status: 'accepted' });
});

test('AC5: POST /rooms with a duplicate identifier is rejected', async () => {
  const typesRes = await request(app).get('/rooms/room-types');
  const roomTypeId = typesRes.body[0].id;
  await request(app).post('/rooms').send({ identifier: 'DUP-2', roomTypeId });
  const before = (await request(app).get('/rooms')).body.length;
  const res = await request(app).post('/rooms').send({ identifier: 'DUP-2', roomTypeId });
  expect(res.status).toBe(400);
  const after = (await request(app).get('/rooms')).body.length;
  expect(after).toBe(before);
});

test('GET /rooms/:id for an unknown id returns 404', async () => {
  const res = await request(app).get('/rooms/does-not-exist');
  expect(res.status).toBe(404);
});

test('PATCH /rooms/:id/status for an unknown id returns 404', async () => {
  const res = await request(app).patch('/rooms/does-not-exist/status').send({ status: 'maintenance' });
  expect(res.status).toBe(404);
});

test('POST /rooms/:id/booking-requests for an unknown id returns 404', async () => {
  const res = await request(app).post('/rooms/does-not-exist/booking-requests').send({});
  expect(res.status).toBe(404);
});
