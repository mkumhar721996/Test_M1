const request = require('supertest');
const app = require('../src/server');

async function newEmployee(name = 'Priya Shah') {
  return (await request(app).post('/employees').send({ name, email: 'priya@example.com', jobTitle: 'People Ops' })).body.id;
}

test('AC1: GET /leave/types returns the fixed set of three leave types in order', async () => {
  const res = await request(app).get('/leave/types');
  expect(res.status).toBe(200);
  expect(res.body.map((t) => t.id)).toEqual(['annual', 'sick', 'unpaid']);
});

test('AC2: POST records a starting balance for each leave type once onboarded', async () => {
  const employeeId = await newEmployee();
  const res = await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 15, sick: 10, unpaid: 5 });
  expect(res.status).toBe(200);
  expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
  expect(res.body.created).toBe(true);
});

test('AC2: omitting values defaults each type to its default starting balance', async () => {
  const employeeId = await newEmployee();
  const res = await request(app).post(`/leave/balances/${employeeId}`).send({});
  expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
});

test('AC2: 0 is a valid balance, negative or non-numeric is rejected', async () => {
  const employeeId = await newEmployee();
  const zero = await request(app).post(`/leave/balances/${employeeId}`).send({ unpaid: 0 });
  expect(zero.status).toBe(200);
  expect(zero.body.balances.unpaid).toBe(0);
  const neg = await request(app).post(`/leave/balances/${employeeId}`).send({ sick: -1 });
  expect(neg.status).toBe(400);
  const bad = await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 'lots' });
  expect(bad.status).toBe(400);
});

test('AC3: querying or initializing balances without onboarding is rejected', async () => {
  const getRes = await request(app).get('/leave/balances/not-a-real-employee-id');
  expect(getRes.status).toBe(404);
  const postRes = await request(app).post('/leave/balances/not-a-real-employee-id').send({});
  expect(postRes.status).toBe(404);
});

test('AC3: an onboarded employee with no balance recorded has none to query', async () => {
  const employeeId = await newEmployee();
  const res = await request(app).get(`/leave/balances/${employeeId}`);
  expect(res.status).toBe(404);
});

test('AC4: GET returns the current balance per leave type', async () => {
  const employeeId = await newEmployee();
  await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 20, sick: 10, unpaid: 5 });
  const res = await request(app).get(`/leave/balances/${employeeId}`);
  expect(res.status).toBe(200);
  expect(res.body.balances).toEqual({ annual: 20, sick: 10, unpaid: 5 });
});

test('re-adjusting upserts in place and reports created: false', async () => {
  const employeeId = await newEmployee();
  await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 15, sick: 10, unpaid: 5 });
  const res = await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 18, sick: 10, unpaid: 5 });
  expect(res.body.created).toBe(false);
  expect(res.body.balances.annual).toBe(18);
});
