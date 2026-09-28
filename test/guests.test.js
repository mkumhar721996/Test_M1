const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');
const { STAFF_USERNAME, STAFF_PASSWORD } = require('../src/middleware/staffAuth');

afterEach(() => {
  jest.restoreAllMocks();
});

test('GET /guests/search returns active matches by default', async () => {
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD).query({ q: 'Amara' });
  expect(res.status).toBe(200);
  expect(res.body.map((g) => g.name).sort()).toEqual(['Amara Chen', 'Amara Whitfield']);
});

test('GET /guests/search?includeInactive=true also returns deactivated matches', async () => {
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD).query({ q: 'Amara', includeInactive: 'true' });
  expect(res.status).toBe(200);
  expect(res.body.map((g) => g.name)).toContain('Amara Osei');
});

test('GET /guests/search with a blank query returns a 400', async () => {
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD).query({ q: '   ' });
  expect(res.status).toBe(400);
});

test('GET /guests/search with no q param at all returns a 400', async () => {
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD);
  expect(res.status).toBe(400);
});

test('edge case: an includeInactive value other than the literal string "true" is treated as false', async () => {
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD).query({ q: 'Amara', includeInactive: 'yes' });
  expect(res.status).toBe(200);
  expect(res.body.map((g) => g.name)).not.toContain('Amara Osei');
});

test('AC4/AC5: GET /guests/search returns 500 and no guest array when the store fails', async () => {
  jest.spyOn(guestsStore, 'searchGuests').mockImplementation(() => {
    throw new Error('down');
  });
  const res = await request(app).get('/guests/search').auth(STAFF_USERNAME, STAFF_PASSWORD).query({ q: 'Amara' });
  expect(res.status).toBe(500);
  expect(Array.isArray(res.body)).toBe(false);
});

test('security: GET /guests/search with no credentials returns 401 and no guest data', async () => {
  const res = await request(app).get('/guests/search').query({ q: 'Amara' });
  expect(res.status).toBe(401);
  expect(res.body).not.toHaveProperty('length');
});

test('security: GET /guests/search with wrong credentials returns 401', async () => {
  const res = await request(app).get('/guests/search').auth('someone', 'wrong-password').query({ q: 'Amara' });
  expect(res.status).toBe(401);
});

test('POST /guests/search/client-error accepts a telemetry report without requiring auth', async () => {
  const res = await request(app).post('/guests/search/client-error').send({ message: 'search failed' });
  expect(res.status).toBe(204);
});
