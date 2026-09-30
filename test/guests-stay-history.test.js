const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');

function seedGuest() {
  return guestsStore.createGuest({ name: 'Stay Guest', email: `stay-${Date.now()}-${Math.random()}@example.com` }, 'system');
}

test('AC2/AC3: responds 502 when the dependency is unavailable, without mutating the guest record', async () => {
  const guest = seedGuest();
  const res = await request(app).get(`/guests/${guest.id}/stay-history`).set('x-staff-role', 'front_desk');
  expect(res.status).toBe(502);
  expect(res.body).toEqual({ error: 'stay_history_unavailable' });
  expect(guestsStore.getGuest(guest.id)).toMatchObject({ name: 'Stay Guest' });
});

test('unknown guest id returns 404', async () => {
  const res = await request(app).get('/guests/does-not-exist/stay-history').set('x-staff-role', 'front_desk');
  expect(res.status).toBe(404);
});

test('a non-front-desk role gets 403', async () => {
  const guest = seedGuest();
  const res = await request(app).get(`/guests/${guest.id}/stay-history`).set('x-staff-role', 'housekeeping');
  expect(res.status).toBe(403);
});

test('no x-staff-role header at all gets 401', async () => {
  const guest = seedGuest();
  const res = await request(app).get(`/guests/${guest.id}/stay-history`);
  expect(res.status).toBe(401);
});
