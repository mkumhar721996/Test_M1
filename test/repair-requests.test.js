const request = require('supertest');
const app = require('../src/server');

const validPayload = {
  categoryId: 'plumbing',
  description: 'Leaking sink',
  preferredDate: '2026-10-10',
  timeWindowId: 'morning',
  address: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
};

test('AC3: valid request without photos succeeds', async () => {
  const res = await request(app).post('/repair-requests').send(validPayload);
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('Pending');
  expect(res.body.photoCount).toBe(0);
});

test('AC4: missing required fields are rejected with field errors', async () => {
  const res = await request(app).post('/repair-requests').send({ categoryId: 'plumbing' });
  expect(res.status).toBe(400);
  expect(res.body.fields).toEqual(expect.objectContaining({
    description: expect.any(String), timeWindow: expect.any(String), address: expect.any(String),
  }));
});

test('AC5: photos are included', async () => {
  const res = await request(app).post('/repair-requests').send({ ...validPayload, photos: [{ name: 'a.jpg' }, { name: 'b.jpg' }] });
  expect(res.status).toBe(201);
  expect(res.body.photoCount).toBe(2);
});

test('AC6: submitted request appears first in the dispatch queue as Pending', async () => {
  const created = await request(app).post('/repair-requests').send(validPayload);
  const queue = await request(app).get('/repair-requests');
  expect(queue.status).toBe(200);
  expect(queue.body[0]).toMatchObject({ id: created.body.id, status: 'Pending' });
});

test('AC7: unstaffed window is still accepted as Pending', async () => {
  const res = await request(app).post('/repair-requests').send({ ...validPayload, timeWindowId: 'evening' });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('Pending');
  expect(res.body.staffed).toBe(false);
});
