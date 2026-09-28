const request = require('supertest');
const app = require('../src/server');

test('AC1: creating a rate plan with a name, date range, and one price is saved and listed', async () => {
  const res = await request(app).post('/rate-plans').send({
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    prices: [{ roomType: 'STD-KING', price: 159 }],
  });
  expect(res.status).toBe(201);
  expect(typeof res.body.id).toBe('string');
  const listRes = await request(app).get('/rate-plans');
  expect(listRes.body.some((p) => p.id === res.body.id)).toBe(true);
});

test('AC2: PATCH updates a plan and the change is reflected in GET /:id', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Autumn Weekday Rate',
    startDate: '2026-09-01',
    endDate: '2026-11-30',
    prices: [{ roomType: 'GARDEN', price: 135 }],
  });
  const { id } = createRes.body;
  const patchRes = await request(app).patch(`/rate-plans/${id}`).send({ name: 'Autumn Weekday Rate v2' });
  expect(patchRes.status).toBe(200);
  expect(patchRes.body.name).toBe('Autumn Weekday Rate v2');
  const getRes = await request(app).get(`/rate-plans/${id}`);
  expect(getRes.body.name).toBe('Autumn Weekday Rate v2');
});

test('AC5/AC6: POST with a missing name returns 400 and is not saved', async () => {
  const before = (await request(app).get('/rate-plans')).body.length;
  const res = await request(app).post('/rate-plans').send({
    name: '', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'GARDEN', price: 100 }],
  });
  expect(res.status).toBe(400);
  const after = (await request(app).get('/rate-plans')).body.length;
  expect(after).toBe(before);
});

test('AC5/AC6: POST with an end date before the start date returns 400 and is not saved', async () => {
  const before = (await request(app).get('/rate-plans')).body.length;
  const res = await request(app).post('/rate-plans').send({
    name: 'Bad Range', startDate: '2026-05-10', endDate: '2026-05-01', prices: [{ roomType: 'GARDEN', price: 100 }],
  });
  expect(res.status).toBe(400);
  const after = (await request(app).get('/rate-plans')).body.length;
  expect(after).toBe(before);
});

test('AC8: no rate plan covers this room type/date, so the base rate is returned', async () => {
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'GARDEN', date: '2026-03-01' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ source: 'base', price: 149 });
});

test('price-lookup returns 400 when roomType or date is missing', async () => {
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'GARDEN' });
  expect(res.status).toBe(400);
});

test('GET /rate-plans/room-types returns the seeded room types, not swallowed by the :id route', async () => {
  const res = await request(app).get('/rate-plans/room-types');
  expect(res.status).toBe(200);
  expect(res.body.some((rt) => rt.code === 'STD-KING')).toBe(true);
});

test('GET /rate-plans/:id for an unknown id returns 404', async () => {
  const res = await request(app).get('/rate-plans/does-not-exist');
  expect(res.status).toBe(404);
});

test('PATCH /rate-plans/:id for an unknown id returns 404', async () => {
  const res = await request(app).patch('/rate-plans/does-not-exist').send({ name: 'X' });
  expect(res.status).toBe(404);
});

test('DELETE /rate-plans/:id removes the plan and returns 204; unknown id returns 404', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Deletable Plan', startDate: '2026-02-01', endDate: '2026-02-10', prices: [{ roomType: 'GARDEN', price: 100 }],
  });
  const { id } = createRes.body;
  const delRes = await request(app).delete(`/rate-plans/${id}`);
  expect(delRes.status).toBe(204);
  const getRes = await request(app).get(`/rate-plans/${id}`);
  expect(getRes.status).toBe(404);
  const delAgainRes = await request(app).delete(`/rate-plans/${id}`);
  expect(delAgainRes.status).toBe(404);
});
