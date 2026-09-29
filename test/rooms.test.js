const request = require('supertest');
const app = require('../src/server');
const roomsStore = require('../src/rooms/store');

test('AC1: POST /rooms as front_desk creates the room and returns it with those attributes', async () => {
  const res = await request(app)
    .post('/rooms')
    .set('x-staff-role', 'front_desk')
    .send({ number: '220', type: 'Suite', status: 'available' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ number: '220', type: 'Suite', status: 'available' });
  expect(roomsStore.listRooms()).toContainEqual(expect.objectContaining({ number: '220' }));
});

test('AC1: POST /rooms rejects a duplicate room number with 400', async () => {
  await request(app).post('/rooms').set('x-staff-role', 'front_desk').send({ number: '221', type: 'Standard', status: 'available' });
  const res = await request(app).post('/rooms').set('x-staff-role', 'front_desk').send({ number: '221', type: 'Deluxe', status: 'available' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
});

test('AC2: PATCH /rooms/:id updates number, type, and status', async () => {
  const created = await request(app).post('/rooms').set('x-staff-role', 'front_desk').send({ number: '205', type: 'Deluxe', status: 'available' });
  const res = await request(app)
    .patch(`/rooms/${created.body.id}`)
    .set('x-staff-role', 'front_desk')
    .send({ number: '206', type: 'Suite', status: 'occupied' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ number: '206', type: 'Suite', status: 'occupied' });
});

test('AC3/AC4: POST /rooms/:id/deactivate retains the record but marks it inactive', async () => {
  const created = await request(app).post('/rooms').set('x-staff-role', 'front_desk').send({ number: '402', type: 'Deluxe', status: 'available' });
  const res = await request(app).post(`/rooms/${created.body.id}/deactivate`).set('x-staff-role', 'front_desk').send({});
  expect(res.status).toBe(200);
  expect(res.body.active).toBe(false);
  expect(roomsStore.getRoom(created.body.id)).toBeTruthy();
});

test('AC8/AC9: PATCH to maintenance is blocked with 409 when reservations are active', async () => {
  const room = roomsStore.createRoom({
    number: '102',
    type: 'Standard',
    status: 'occupied',
    reservations: [{ id: 'RES-1', state: 'checked_in', guest: 'Maria Alvarez', dates: 'Sep 28 – Sep 30, 2026' }],
  });
  const res = await request(app).patch(`/rooms/${room.id}`).set('x-staff-role', 'front_desk').send({ status: 'maintenance' });
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('maintenance_blocked');
  expect(res.body.conflictingReservations).toHaveLength(1);
  expect(roomsStore.getRoom(room.id).status).toBe('occupied');
});
