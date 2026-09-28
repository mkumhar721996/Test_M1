const request = require('supertest');
const app = require('../src/server');

const ACTOR = 'Jordan Blake';

test('AC1: POST /rate-plans saves and lists the new plan', async () => {
  const res = await request(app).post('/rate-plans').send({
    name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-queen': 160 }, actor: ACTOR,
  });
  expect(res.status).toBe(201);
  const listRes = await request(app).get('/rate-plans');
  expect(listRes.body.some((p) => p.id === res.body.id)).toBe(true);
});

test('AC2: PATCH /rate-plans/:id updates a price and future lookups reflect it', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Winter Holidays 2026', startDate: '2026-12-20', endDate: '2027-01-02', prices: { 'rt-suite': 320 }, actor: ACTOR,
  });
  const { id } = createRes.body;
  const patchRes = await request(app).patch(`/rate-plans/${id}`).send({ prices: { 'rt-suite': 355 }, actor: ACTOR });
  expect(patchRes.status).toBe(200);
  const lookupRes = await request(app).get('/rate-plans/price-lookup').query({ roomTypeId: 'rt-suite', date: '2026-12-25' });
  expect(lookupRes.body).toMatchObject({ price: 355, source: 'rate_plan', ratePlanId: id });
});

test('AC3: a room type not listed on the plan falls back to base rate via the API', async () => {
  await request(app).post('/rate-plans').send({
    name: 'Shoulder Season Autumn', startDate: '2026-09-15', endDate: '2026-11-15', prices: { 'rt-queen': 130 }, actor: ACTOR,
  });
  const lookupRes = await request(app).get('/rate-plans/price-lookup').query({ roomTypeId: 'rt-twin', date: '2026-10-01' });
  expect(lookupRes.body).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
});

test('AC4: GET /rate-plans/price-lookup resolves overlaps deterministically without erroring', async () => {
  await request(app).post('/rate-plans').send({
    name: 'Summer Peak 2026 C', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-king': 190 }, actor: ACTOR,
  });
  const newerRes = await request(app).post('/rate-plans').send({
    name: 'Labor Day Weekend C', startDate: '2026-08-29', endDate: '2026-09-02', prices: { 'rt-king': 205 }, actor: ACTOR,
  });
  const lookupRes = await request(app).get('/rate-plans/price-lookup').query({ roomTypeId: 'rt-king', date: '2026-08-30' });
  expect(lookupRes.status).toBe(200);
  expect(lookupRes.body).toMatchObject({ price: 205, ratePlanId: newerRes.body.id, overlapping: true });
});

test('AC6: POST /rate-plans rejects a missing name and does not save it', async () => {
  const res = await request(app).post('/rate-plans').send({
    name: '', startDate: '2026-08-01', endDate: '2026-08-10', prices: { 'rt-queen': 100 }, actor: ACTOR,
  });
  expect(res.status).toBe(400);
});

test('AC6: POST /rate-plans rejects an end date before the start date and does not save it', async () => {
  const res = await request(app).post('/rate-plans').send({
    name: 'Bad Range', startDate: '2026-08-10', endDate: '2026-08-01', prices: { 'rt-queen': 100 }, actor: ACTOR,
  });
  expect(res.status).toBe(400);
  const listRes = await request(app).get('/rate-plans');
  expect(listRes.body.some((p) => p.name === 'Bad Range')).toBe(false);
});

test('AC7: GET /rate-plans returns an empty array when no plans exist', async () => {
  const res = await request(app).get('/rate-plans');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('AC8: GET /rate-plans/price-lookup returns the base rate when no plan is active', async () => {
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomTypeId: 'rt-twin', date: '2020-01-01' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
});

test('DELETE /rate-plans/:id removes a rate plan', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Deletable Plan', startDate: '2026-05-01', endDate: '2026-05-10', prices: { 'rt-queen': 140 }, actor: ACTOR,
  });
  const { id } = createRes.body;
  const delRes = await request(app).delete(`/rate-plans/${id}`);
  expect(delRes.status).toBe(204);
  const getRes = await request(app).get(`/rate-plans/${id}`);
  expect(getRes.status).toBe(404);
});
