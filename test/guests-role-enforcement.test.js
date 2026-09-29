const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');

function seedGuest() {
  return guestsStore.createGuest({ name: 'Seed Guest', email: `seed-${Date.now()}-${Math.random()}@example.com` }, 'system');
}

const ENDPOINTS = [
  { name: 'list', build: () => ({ method: 'get', path: '/guests' }) },
  { name: 'get-by-id', build: (id) => ({ method: 'get', path: `/guests/${id}` }) },
  { name: 'create', build: () => ({ method: 'post', path: '/guests', body: { name: 'New Guest', email: `new-${Date.now()}-${Math.random()}@example.com`, actor: 'Priya Nair' } }) },
  { name: 'patch', build: (id) => ({ method: 'patch', path: `/guests/${id}`, body: { phone: '555-0100', actor: 'Priya Nair' } }) },
  { name: 'deactivate', build: (id) => ({ method: 'post', path: `/guests/${id}/deactivate`, body: { actor: 'Priya Nair' } }) },
  { name: 'reactivate', build: (id) => ({ method: 'post', path: `/guests/${id}/reactivate`, body: { actor: 'Priya Nair' } }) },
];

describe.each(ENDPOINTS)('$name', ({ build }) => {
  test('AC1: a housekeeping role gets 403 and the operation is not performed', async () => {
    const guest = seedGuest();
    const before = { ...guestsStore.getGuest(guest.id) };
    const { method, path, body } = build(guest.id);
    const res = await request(app)[method](path).set('x-staff-role', 'housekeeping').send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(guestsStore.getGuest(guest.id)).toEqual(before);
  });

  test('AC5: no x-staff-role header at all gets 401 and the operation is not performed', async () => {
    const guest = seedGuest();
    const before = { ...guestsStore.getGuest(guest.id) };
    const { method, path, body } = build(guest.id);
    const res = await request(app)[method](path).send(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(guestsStore.getGuest(guest.id)).toEqual(before);
  });

  test('AC2: a front-desk role is processed normally', async () => {
    const guest = seedGuest();
    const { method, path, body } = build(guest.id);
    const res = await request(app)[method](path).set('x-staff-role', 'front_desk').send(body);
    expect([200, 201]).toContain(res.status);
  });
});

test('AC3: role check cannot be bypassed by calling the API directly (no UI involved)', async () => {
  const guest = seedGuest();
  const res = await request(app).post(`/guests/${guest.id}/deactivate`).set('x-staff-role', 'housekeeping').send({ actor: 'Housekeeping Bot' });
  expect(res.status).toBe(403);
  expect(guestsStore.getGuest(guest.id).status).toBe('active');
});

test('AC4: deactivate and reactivate by an authenticated front-desk actor are recorded in the audit log', async () => {
  const guest = seedGuest();
  await request(app).post(`/guests/${guest.id}/deactivate`).set('x-staff-role', 'front_desk').send({ actor: 'Priya Nair' });
  await request(app).post(`/guests/${guest.id}/reactivate`).set('x-staff-role', 'front_desk').send({ actor: 'Priya Nair' });
  const res = await request(app).get(`/guests/${guest.id}`).set('x-staff-role', 'front_desk');
  const [deactivateEntry, reactivateEntry] = res.body.auditLog.slice(-2);
  expect(deactivateEntry).toMatchObject({ actor: 'Priya Nair', action: 'deactivated profile' });
  expect(reactivateEntry).toMatchObject({ actor: 'Priya Nair', action: 'reactivated profile' });
  expect(typeof deactivateEntry.ts).toBe('string');
  expect(typeof reactivateEntry.ts).toBe('string');
});
