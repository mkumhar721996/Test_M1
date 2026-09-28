const request = require('supertest');
const app = require('../src/server');

test('GET /room-types lists the seeded room types with base rates', async () => {
  const res = await request(app).get('/room-types');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'rt-queen', name: 'Standard Queen', baseRate: 120 }),
    expect.objectContaining({ id: 'rt-king', name: 'Deluxe King', baseRate: 150 }),
    expect.objectContaining({ id: 'rt-suite', name: 'Suite', baseRate: 240 }),
    expect.objectContaining({ id: 'rt-twin', name: 'Twin', baseRate: 110 }),
  ]));
});
