const request = require('supertest');
const app = require('../src/server');
const { resetRatePlansStore } = require('../src/ratePlans/store');

beforeEach(() => {
  resetRatePlansStore();
});

test('AC1: creating a rate plan with a name, date range, and one price is saved and listed', async () => {
  const res = await request(app).post('/rate-plans').send({
    name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31',
    prices: [{ roomType: 'STD-KING', price: 159 }],
  });
  expect(res.status).toBe(201);
  expect(typeof res.body.id).toBe('string');
  const listRes = await request(app).get('/rate-plans');
  expect(listRes.body.some((p) => p.id === res.body.id)).toBe(true);
});

test('AC1 (validation): creating a rate plan with a blank name is rejected and not saved', async () => {
  const before = (await request(app).get('/rate-plans')).body.length;
  const res = await request(app).post('/rate-plans').send({
    name: '', startDate: '2026-06-01', endDate: '2026-08-31', prices: [{ roomType: 'STD-KING', price: 159 }],
  });
  expect(res.status).toBe(400);
  const after = (await request(app).get('/rate-plans')).body.length;
  expect(after).toBe(before);
});

test('AC2: editing an existing plan via PATCH updates its stored name, dates, and prices', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Autumn', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }],
  });
  const patchRes = await request(app).patch(`/rate-plans/${createRes.body.id}`).send({
    prices: [{ roomType: 'GARDEN', price: 99 }],
  });
  expect(patchRes.status).toBe(200);
  expect(patchRes.body.prices).toEqual([{ roomType: 'GARDEN', price: 99 }]);
});

test('AC2 (validation): PATCH with an invalid change is rejected and leaves the plan unchanged', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Autumn', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }],
  });
  const patchRes = await request(app).patch(`/rate-plans/${createRes.body.id}`).send({ name: '' });
  expect(patchRes.status).toBe(400);
  const getRes = await request(app).get(`/rate-plans/${createRes.body.id}`);
  expect(getRes.body.name).toBe('Autumn');
});

test('GET /rate-plans/:id for an unknown id returns 404', async () => {
  const res = await request(app).get('/rate-plans/does-not-exist');
  expect(res.status).toBe(404);
});

test('PATCH /rate-plans/:id for an unknown id returns 404', async () => {
  const res = await request(app).patch('/rate-plans/does-not-exist').send({ name: 'X' });
  expect(res.status).toBe(404);
});

test('DELETE /rate-plans/:id removes the plan and returns 204', async () => {
  const createRes = await request(app).post('/rate-plans').send({
    name: 'Temp', startDate: '2026-05-01', endDate: '2026-05-10', prices: [{ roomType: 'GARDEN', price: 100 }],
  });
  const delRes = await request(app).delete(`/rate-plans/${createRes.body.id}`);
  expect(delRes.status).toBe(204);
  const getRes = await request(app).get(`/rate-plans/${createRes.body.id}`);
  expect(getRes.status).toBe(404);
});

test('DELETE /rate-plans/:id for an unknown id returns 404', async () => {
  const res = await request(app).delete('/rate-plans/does-not-exist');
  expect(res.status).toBe(404);
});

test('GET /rate-plans/room-types returns the seeded room types', async () => {
  const res = await request(app).get('/rate-plans/room-types');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.arrayContaining([
    { code: 'STD-KING', name: 'Standard King', baseRate: 129 },
  ]));
});

test('AC8: no rate plan covers this room type/date, so the base rate is returned', async () => {
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'GARDEN', date: '2026-03-01' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ source: 'base', price: 149 });
});

test('GET /rate-plans/price-lookup requires roomType and date query params', async () => {
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'GARDEN' });
  expect(res.status).toBe(400);
});

test('AC8: a rate plan covering the room type/date returns its plan price', async () => {
  await request(app).post('/rate-plans').send({
    name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31',
    prices: [{ roomType: 'OCEAN', price: 229 }],
  });
  const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'OCEAN', date: '2026-07-10' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ source: 'plan', price: 229 });
});
