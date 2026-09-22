const request = require('supertest');
const app = require('../src/server');

test('GET / serves the expenses page with the list container, dialog mount, and view/app scripts', async () => {
  const res = await request(app).get('/');

  expect(res.status).toBe(200);
  expect(res.text).toContain('id="expenses"');
  expect(res.text).toContain('id="dialog"');
  expect(res.text).toContain('src="/expensesView.js"');
  expect(res.text).toContain('src="/app.js"');
});
