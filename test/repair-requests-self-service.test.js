const request = require('supertest');
const app = require('../src/server');
const store = require('../src/repairRequests/store');
const { createDefaultApi } = require('../public/js/services');

const validPayload = {
  categoryId: 'plumbing',
  description: 'Leaking sink',
  preferredDate: '2026-10-10',
  timeWindowId: 'morning',
  address: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
};

async function createAs(userId) {
  const res = await request(app).post('/repair-requests').set('x-user-id', userId).send(validPayload);
  return res.body.id;
}

test('AC1: a customer can cancel their own Pending request', async () => {
  const id = await createAs('cust-204');
  const res = await request(app).post(`/repair-requests/${id}/cancel`).set('x-user-id', 'cust-204');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('Cancelled');
  expect(res.body.cancelledAt).toEqual(expect.any(String));
});

test('AC2: a customer can edit their own Pending request', async () => {
  const id = await createAs('cust-204');
  const res = await request(app).patch(`/repair-requests/${id}`).set('x-user-id', 'cust-204').send({
    ...validPayload,
    description: 'Now leaking badly',
    address: { ...validPayload.address, city: 'Round Rock' },
  });
  expect(res.status).toBe(200);
  expect(res.body.description).toBe('Now leaking badly');
  expect(res.body.address.city).toBe('Round Rock');
});

test('AC2: an invalid edit is rejected with field errors and changes nothing', async () => {
  const id = await createAs('cust-204');
  const res = await request(app).patch(`/repair-requests/${id}`).set('x-user-id', 'cust-204')
    .send({ ...validPayload, description: '  ' });
  expect(res.status).toBe(400);
  expect(res.body.fields.description).toEqual(expect.any(String));
  expect(store.getRequest(id).description).toBe('Leaking sink');
});

test('AC3: cancel and edit are rejected once the request is Assigned', async () => {
  const id = await createAs('cust-204');
  store.getRequest(id).status = 'Assigned';
  const cancelRes = await request(app).post(`/repair-requests/${id}/cancel`).set('x-user-id', 'cust-204');
  const editRes = await request(app).patch(`/repair-requests/${id}`).set('x-user-id', 'cust-204')
    .send({ ...validPayload, description: 'Changed' });
  expect(cancelRes.status).toBe(409);
  expect(editRes.status).toBe(409);
  expect(editRes.body.error).toBe('repair_request_locked');
  expect(store.getRequest(id).status).toBe('Assigned');
  expect(store.getRequest(id).description).toBe('Leaking sink');
});

test('AC4: another customer cannot read, edit or cancel the request', async () => {
  const id = await createAs('cust-204');
  const getRes = await request(app).get(`/repair-requests/${id}`).set('x-user-id', 'cust-317');
  const patchRes = await request(app).patch(`/repair-requests/${id}`).set('x-user-id', 'cust-317').send(validPayload);
  const cancelRes = await request(app).post(`/repair-requests/${id}/cancel`).set('x-user-id', 'cust-317');
  expect(getRes.status).toBe(404);
  expect(patchRes.status).toBe(404);
  expect(cancelRes.status).toBe(404);
  expect(store.getRequest(id).status).toBe('Pending');
});

test('all self-service routes reject requests without an identity', async () => {
  const id = await createAs('cust-204');
  expect((await request(app).get('/repair-requests/mine')).status).toBe(401);
  expect((await request(app).get(`/repair-requests/${id}`)).status).toBe(401);
  expect((await request(app).patch(`/repair-requests/${id}`).send(validPayload)).status).toBe(401);
  expect((await request(app).post(`/repair-requests/${id}/cancel`)).status).toBe(401);
});

test('GET /repair-requests/mine only returns the caller\'s own requests', async () => {
  const mineId = await createAs('cust-204');
  await createAs('cust-317');
  const res = await request(app).get('/repair-requests/mine').set('x-user-id', 'cust-204');
  expect(res.status).toBe(200);
  expect(res.body.find((r) => r.id === mineId)).toBeDefined();
  expect(res.body.some((r) => r.customerId !== 'cust-204')).toBe(false);
});

test('services.js createDefaultApi().createRequest() tags the submission with the demo customer', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const originalFetch = global.fetch;
    global.fetch = (url, opts) => originalFetch(`http://127.0.0.1:${port}${url}`, opts);
    try {
      const created = await createDefaultApi().createRequest(validPayload);
      expect(created.customerId).toBe('cust-204');
    } finally {
      global.fetch = originalFetch;
    }
  } finally {
    server.close();
  }
});
