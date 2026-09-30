const request = require('supertest');
const app = require('../src/server');
const roomsStore = require('../src/rooms/store');

const DENIED_MESSAGE = {
  view: "You don't have permission to view the room inventory",
  create: "You don't have permission to create rooms",
  update: "You don't have permission to update rooms",
  deactivate: "You don't have permission to deactivate rooms",
};

function seedRoom(number) {
  return roomsStore.createRoom({ number, type: 'Standard', status: 'available' });
}

const ENDPOINTS = [
  { name: 'view', build: () => ({ method: 'get', path: '/rooms' }) },
  { name: 'create', build: () => ({ method: 'post', path: '/rooms', body: { number: '901', type: 'Standard', status: 'available' } }) },
  { name: 'update', build: (id) => ({ method: 'patch', path: `/rooms/${id}`, body: { type: 'Suite' } }) },
  { name: 'deactivate', build: (id) => ({ method: 'post', path: `/rooms/${id}/deactivate`, body: {} }) },
];

describe.each(ENDPOINTS)('$name', ({ name, build }) => {
  test('AC6/AC7: housekeeping is denied with an action-specific message and nothing changes', async () => {
    const room = seedRoom(`150-${name}`);
    const { method, path, body } = build(room.id);
    const res = await request(app)[method](path).set('x-staff-role', 'housekeeping').send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: DENIED_MESSAGE[name] });
    expect(roomsStore.listRooms().some((r) => r.number === '901')).toBe(false);
    expect(roomsStore.getRoom(room.id)).toMatchObject({ number: `150-${name}`, type: 'Standard', status: 'available' });
  });

  test('AC6/AC7: no x-staff-role header is also denied with the same action-specific message', async () => {
    const room = seedRoom(`151-${name}`);
    const { method, path, body } = build(room.id);
    const res = await request(app)[method](path).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: DENIED_MESSAGE[name] });
  });

  test('front-desk is permitted', async () => {
    const room = seedRoom(`152-${name}`);
    const { method, path, body } = build(room.id);
    const res = await request(app)[method](path).set('x-staff-role', 'front_desk').send(body);
    expect([200, 201]).toContain(res.status);
  });
});
