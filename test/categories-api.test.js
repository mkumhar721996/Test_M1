const request = require('supertest');
const app = require('../src/server');

test('GET /categories returns each category with a name, total spend, and nullable spend limit', async () => {
  const res = await request(app).get('/categories');
  expect(res.status).toBe(200);
  res.body.forEach((cat) => {
    expect(typeof cat.name).toBe('string');
    expect(typeof cat.totalSpend).toBe('number');
    expect(cat.spendLimit === null || typeof cat.spendLimit === 'number').toBe(true);
  });
  expect(res.body.some((c) => c.spendLimit != null && c.totalSpend >= c.spendLimit)).toBe(true);
  expect(res.body.some((c) => c.spendLimit === null)).toBe(true);
});
