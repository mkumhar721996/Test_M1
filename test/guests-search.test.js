const request = require('supertest');
const app = require('../src/server');
const guestsStore = require('../src/guests/store');

afterEach(() => {
  jest.restoreAllMocks();
});

test('route-ordering regression: GET /guests/search is not captured by GET /:id', async () => {
  const res = await request(app)
    .get('/guests/search')
    .query({ q: 'Anyone' });

  expect(res.status).not.toBe(404);
});

test('empty query returns a structured 400', async () => {
  const res = await request(app)
    .get('/guests/search')
    .query({ q: '   ' });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'query is required' });
});

test('AC1/AC9: a real search against a created guest returns the display fields', async () => {
  const created = await request(app)
    .post('/guests')
    .set('x-staff-role', 'front_desk')
    .send({ name: 'Whitfield Search Target', email: 'whitfield.search@example.com', phone: '(212) 555-0199' });

  const res = await request(app)
    .get('/guests/search')
    .query({ q: 'Whitfield Search Target' });

  expect(res.status).toBe(200);
  expect(res.body).toEqual([
    expect.objectContaining({
      id: created.body.id,
      name: 'Whitfield Search Target',
      email: 'whitfield.search@example.com',
      phone: '(212) 555-0199',
      status: 'active',
    }),
  ]);
});

test('AC4/AC5: an unexpected store error returns 500 with no results', async () => {
  jest.spyOn(guestsStore, 'searchGuests').mockImplementation(() => { throw new Error('down'); });

  const res = await request(app)
    .get('/guests/search')
    .query({ q: 'Amara' });

  expect(res.status).toBe(500);
  expect(Array.isArray(res.body)).toBe(false);
});
