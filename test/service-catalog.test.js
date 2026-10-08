const request = require('supertest');
const app = require('../src/server');

test('AC1: GET /service-catalog returns categories and time windows, read-only', async () => {
  const res = await request(app).get('/service-catalog');
  expect(res.status).toBe(200);
  expect(res.body.categories.length).toBeGreaterThanOrEqual(1);
  expect(res.body.timeWindows.length).toBeGreaterThanOrEqual(1);
  const post = await request(app).post('/service-catalog').send({ name: 'New category' });
  expect(post.status).toBe(404);
});
