const request = require('supertest');
const app = require('../src/server');
const { updateRequestStatus } = require('../src/repairRequests/store');

const validPayload = {
  categoryId: 'plumbing',
  description: 'Leaking sink',
  preferredDate: '2026-10-10',
  timeWindowId: 'morning',
  address: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
};

const create = async (customer) => (
  await request(app).post('/repair-requests').set('x-customer-id', customer).send(validPayload)
).body;
const mine = (customer) => request(app).get('/repair-requests/mine').set('x-customer-id', customer);
const detail = (id, customer) => request(app).get(`/repair-requests/mine/${id}`).set('x-customer-id', customer);

afterEach(() => { process.env.NODE_ENV = 'test'; });

test('AC1: list shows each request in the customer-facing status vocabulary', async () => {
  const c = 'cust_ac1';
  const submitted = await create(c);
  const assigned = await create(c);
  const inProgress = await create(c);
  const completed = await create(c);
  const cancelled = await create(c);
  updateRequestStatus(assigned.id, { status: 'Assigned', technician: 'Marcus Webb' });
  updateRequestStatus(inProgress.id, { status: 'In Progress', technician: 'Marcus Webb' });
  updateRequestStatus(completed.id, { status: 'Completed', technician: 'Marcus Webb' });
  updateRequestStatus(cancelled.id, { status: 'Cancelled', cancelReason: 'Customer asked' });
  const res = await mine(c);
  const statusById = Object.fromEntries(res.body.map((r) => [r.id, r.status]));
  expect(statusById[submitted.id]).toBe('Submitted');
  expect(statusById[assigned.id]).toBe('Assigned');
  expect(statusById[inProgress.id]).toBe('In Progress');
  expect(statusById[completed.id]).toBe('Completed');
  expect(statusById[cancelled.id]).toBe('Cancelled');
});

test('AC2: open and past requests both appear', async () => {
  const c = 'cust_ac2';
  const open = await create(c);
  const past = await create(c);
  updateRequestStatus(past.id, { status: 'Completed' });
  const res = await mine(c);
  expect(res.body.map((r) => r.id)).toEqual(expect.arrayContaining([open.id, past.id]));
});

test('AC3: assigned technician is returned', async () => {
  const r = await create('cust_ac3');
  updateRequestStatus(r.id, { status: 'Assigned', technician: 'Marcus Webb' });
  const res = await detail(r.id, 'cust_ac3');
  expect(res.status).toBe(200);
  expect(res.body.technician).toBe('Marcus Webb');
});

test('AC4: unassigned request has no technician', async () => {
  const r = await create('cust_ac4');
  expect((await detail(r.id, 'cust_ac4')).body.technician).toBeNull();
});

test('AC5: unassigned request is pending assignment (Submitted) with no technician', async () => {
  const r = await create('cust_ac5');
  const res = await detail(r.id, 'cust_ac5');
  expect(res.body.status).toBe('Submitted');
  expect(res.body.technician).toBeNull();
});

test('AC6: changing one request leaves the others untouched', async () => {
  const c = 'cust_ac6';
  const a = await create(c);
  const b = await create(c);
  updateRequestStatus(a.id, { status: 'Assigned', technician: 'Marcus Webb' });
  const byId = Object.fromEntries((await mine(c)).body.map((r) => [r.id, r]));
  expect(byId[a.id].status).toBe('Assigned');
  expect(byId[b.id].status).toBe('Submitted');
  expect(byId[b.id].technician).toBeNull();
});

test('AC8: customers only see their own requests; identity is required', async () => {
  const jordan = await create('cust_ac8_jordan');
  const riley = await create('cust_ac8_riley');
  const res = await mine('cust_ac8_jordan');
  const ids = res.body.map((r) => r.id);
  expect(ids).toContain(jordan.id);
  expect(ids).not.toContain(riley.id);
  expect((await detail(riley.id, 'cust_ac8_jordan')).status).toBe(404);
  expect((await detail('REQ-nope', 'cust_ac8_jordan')).status).toBe(404);
  expect((await request(app).get('/repair-requests/mine')).status).toBe(401);
  expect((await request(app).get(`/repair-requests/mine/${jordan.id}`)).status).toBe(401);
  process.env.NODE_ENV = 'production';
  expect((await mine('cust_ac8_jordan')).status).toBe(401);
});

test('AC9: a status change made elsewhere shows on the next view', async () => {
  const r = await create('cust_ac9');
  expect((await detail(r.id, 'cust_ac9')).body.status).toBe('Submitted');
  updateRequestStatus(r.id, { status: 'Assigned', technician: 'Marcus Webb' });
  const res2 = await detail(r.id, 'cust_ac9');
  expect(res2.body.status).toBe('Assigned');
  expect(res2.body.technician).toBe('Marcus Webb');
});

test('customer view hides internal fields and keeps legacy create status', async () => {
  const r = await create('cust_view');
  expect(r.status).toBe('Pending');
  const body = (await detail(r.id, 'cust_view')).body;
  expect(body).not.toHaveProperty('customerId');
  expect(body).not.toHaveProperty('photos');
});

test('AC10: status mutation route is dispatcher-only', async () => {
  const r = await create('cust_ac10');
  const asCustomer = await request(app).patch(`/repair-requests/${r.id}/status`).set('x-customer-id', 'cust_ac10').send({ status: 'Cancelled' });
  expect(asCustomer.status).toBe(401);
  const asOther = await request(app).patch(`/repair-requests/${r.id}/status`).set('x-staff-role', 'technician').send({ status: 'Cancelled' });
  expect(asOther.status).toBe(403);
  expect((await detail(r.id, 'cust_ac10')).body.status).toBe('Submitted');
});

test('dispatcher can update status; invalid status and unknown id are rejected', async () => {
  const r = await create('cust_patch');
  const patch = (id, body) => request(app).patch(`/repair-requests/${id}/status`).set('x-staff-role', 'dispatcher').send(body);
  const ok = await patch(r.id, { status: 'Assigned', technician: 'Marcus Webb' });
  expect(ok.status).toBe(200);
  expect(ok.body.status).toBe('Assigned');
  expect((await patch(r.id, { status: 'Submitted' })).status).toBe(400);
  expect((await patch('REQ-nope', { status: 'Assigned' })).status).toBe(404);
  const done = await patch(r.id, { status: 'Cancelled', cancelReason: 'Duplicate' });
  expect(done.body.cancelledAt).toBeTruthy();
  const view = (await detail(r.id, 'cust_patch')).body;
  expect(view.cancelReason).toBe('Duplicate');
});
