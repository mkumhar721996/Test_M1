const request = require('supertest');
const app = require('../src/server');
const { approveRequest } = require('../src/leave/requestsStore');

async function newEmployee(name = 'Jordan Avery') {
  return (await request(app).post('/employees').send({ name, email: 'jordan@example.com', jobTitle: 'Analyst' })).body.id;
}

async function withBalance(name) {
  const employeeId = await newEmployee(name);
  await request(app).post(`/leave/balances/${employeeId}`).set('x-staff-role', 'hr').send({ annual: 15, sick: 10, unpaid: 5 });
  return employeeId;
}

function asEmployee(req, employeeId) {
  return req.set('x-employee-id', employeeId);
}

function create(employeeId, body = { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-23' }) {
  return asEmployee(request(app).post('/leave/requests'), employeeId).send(body);
}

function balanceOf(employeeId) {
  return asEmployee(request(app).get(`/leave/balances/${employeeId}`), employeeId);
}

test('AC1: creating a request for a leave type and whole-day range returns status pending', async () => {
  const employeeId = await withBalance();
  const res = await create(employeeId, { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('pending');
  expect(res.body.days).toBe(5);
  expect(res.body.employeeId).toBe(employeeId);
  expect(res.body.leaveTypeName).toBe('Annual leave');
});

test('AC1: validation rejects a bad leave type, bad dates, and end before start', async () => {
  const employeeId = await withBalance();
  expect((await create(employeeId, { leaveTypeId: 'bogus', start: '2026-12-22', end: '2026-12-23' })).status).toBe(400);
  expect((await create(employeeId, { leaveTypeId: 'annual', start: 'nope', end: '2026-12-23' })).status).toBe(400);
  expect((await create(employeeId, { leaveTypeId: 'annual', start: '2026-12-24', end: '2026-12-22' })).status).toBe(400);
  expect((await create(employeeId, { leaveTypeId: 'annual', start: '2026-02-31', end: '2026-03-02' })).status).toBe(400);
});

test('actor safe-default: creating without x-employee-id is unauthorized; unknown employee is 404', async () => {
  expect((await request(app).post('/leave/requests').send({ leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-23' })).status).toBe(401);
  expect((await create('emp_missing')).status).toBe(404);
});

test('AC2: cancelling a pending request cancels it and leaves the balance unchanged', async () => {
  const employeeId = await withBalance();
  const created = await create(employeeId, { leaveTypeId: 'sick', start: '2026-12-22', end: '2026-12-23' });
  const res = await asEmployee(request(app).post(`/leave/requests/${created.body.id}/cancel`), employeeId);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('cancelled');
  expect((await balanceOf(employeeId)).body.balances.sick).toBe(10);
});

test('AC3: cancelling an approved request restores the consumed balance', async () => {
  const employeeId = await withBalance();
  const created = await create(employeeId);
  approveRequest(created.body.id);
  expect((await balanceOf(employeeId)).body.balances.annual).toBe(13);
  const res = await asEmployee(request(app).post(`/leave/requests/${created.body.id}/cancel`), employeeId);
  expect(res.body.status).toBe('cancelled');
  expect((await balanceOf(employeeId)).body.balances.annual).toBe(15);
});

test('cancelling twice is 409 and does not restore twice; unknown id is 404', async () => {
  const employeeId = await withBalance();
  const { id } = (await create(employeeId)).body;
  approveRequest(id);
  await asEmployee(request(app).post(`/leave/requests/${id}/cancel`), employeeId);
  expect((await asEmployee(request(app).post(`/leave/requests/${id}/cancel`), employeeId)).status).toBe(409);
  expect((await balanceOf(employeeId)).body.balances.annual).toBe(15);
  expect((await asEmployee(request(app).post('/leave/requests/missing/cancel'), employeeId)).status).toBe(404);
});

test('an employee cannot cancel another employee\'s request', async () => {
  const owner = await withBalance();
  const other = await withBalance('Priya Shah');
  const { id } = (await create(owner)).body;
  expect((await asEmployee(request(app).post(`/leave/requests/${id}/cancel`), other)).status).toBe(403);
});

test('AC4: the submitter sees only their own requests with leave type, dates and status', async () => {
  const mine = await withBalance();
  const other = await withBalance('Priya Shah');
  await create(mine, { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' });
  await create(other);
  const res = await asEmployee(request(app).get('/leave/requests'), mine);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0]).toMatchObject({
    leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26', status: 'pending',
  });
});

test('AC4: HR and Manager see every employee\'s requests; no identity is unauthorized', async () => {
  const a = await withBalance();
  const b = await withBalance('Priya Shah');
  const { id: idA } = (await create(a)).body;
  const { id: idB } = (await create(b)).body;
  const hr = await request(app).get('/leave/requests').set('x-staff-role', 'hr');
  expect(hr.body.map((r) => r.id)).toEqual(expect.arrayContaining([idA, idB]));
  expect((await request(app).get('/leave/requests').set('x-staff-role', 'manager')).status).toBe(200);
  expect((await request(app).get('/leave/requests')).status).toBe(401);
});

test('approveRequest rejects a non-pending request', async () => {
  const employeeId = await withBalance();
  const { id } = (await create(employeeId)).body;
  approveRequest(id);
  expect(() => approveRequest(id)).toThrow(expect.objectContaining({ statusCode: 409 }));
});
