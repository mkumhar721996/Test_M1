const request = require('supertest');
const app = require('../src/server');

async function newEmployee(name = 'Priya Shah') {
  return (await request(app).post('/employees').send({ name, email: 'priya@example.com', jobTitle: 'People Ops' })).body.id;
}

function asHr(req) {
  return req.set('x-staff-role', 'hr');
}

test('AC1: GET /leave/types returns the fixed set of three leave types in order', async () => {
  const res = await request(app).get('/leave/types');
  expect(res.status).toBe(200);
  expect(res.body.map((t) => t.id)).toEqual(['annual', 'sick', 'unpaid']);
});

test('AC2: POST records a starting balance for each leave type once onboarded', async () => {
  const employeeId = await newEmployee();
  const res = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 15, sick: 10, unpaid: 5 });
  expect(res.status).toBe(200);
  expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
  expect(res.body.created).toBe(true);
});

test('AC2: omitting values defaults each type to its default starting balance', async () => {
  const employeeId = await newEmployee();
  const res = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({});
  expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
});

test('AC2: 0 is a valid balance, negative or non-numeric is rejected', async () => {
  const employeeId = await newEmployee();
  const zero = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ unpaid: 0 });
  expect(zero.status).toBe(200);
  expect(zero.body.balances.unpaid).toBe(0);
  const neg = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ sick: -1 });
  expect(neg.status).toBe(400);
  const bad = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 'lots' });
  expect(bad.status).toBe(400);
});

test('AC3: querying or initializing balances without onboarding is rejected', async () => {
  const getRes = await asHr(request(app).get('/leave/balances/not-a-real-employee-id'));
  expect(getRes.status).toBe(404);
  const postRes = await asHr(request(app).post('/leave/balances/not-a-real-employee-id')).send({});
  expect(postRes.status).toBe(404);
});

test('AC3: an onboarded employee with no balance recorded has none to query', async () => {
  const employeeId = await newEmployee();
  const res = await asHr(request(app).get(`/leave/balances/${employeeId}`));
  expect(res.status).toBe(404);
});

test('AC4: GET returns the current balance per leave type', async () => {
  const employeeId = await newEmployee();
  await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 20, sick: 10, unpaid: 5 });
  const res = await asHr(request(app).get(`/leave/balances/${employeeId}`));
  expect(res.status).toBe(200);
  expect(res.body.balances).toEqual({ annual: 20, sick: 10, unpaid: 5 });
});

test('AC4: GET /leave/balances returns every recorded balance in one batch', async () => {
  const employeeId = await newEmployee();
  await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 20, sick: 10, unpaid: 5 });
  const res = await asHr(request(app).get('/leave/balances'));
  expect(res.status).toBe(200);
  expect(res.body.some((r) => r.employeeId === employeeId && r.balances.annual === 20)).toBe(true);
});

test('re-adjusting upserts in place and reports created: false', async () => {
  const employeeId = await newEmployee();
  await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 15, sick: 10, unpaid: 5 });
  const res = await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 18, sick: 10, unpaid: 5 });
  expect(res.body.created).toBe(false);
  expect(res.body.balances.annual).toBe(18);
});

test('initializeBalances defaults every type when called with a null values argument', async () => {
  const { initializeBalances } = require('../src/leave/store');
  const employeeId = await newEmployee();
  const record = initializeBalances(employeeId, null);
  expect(record.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
});

describe('access control: who may set or adjust balances is HR-only by default', () => {
  test('POST /leave/balances/:employeeId with no x-staff-role header is unauthorized', async () => {
    const employeeId = await newEmployee();
    const res = await request(app).post(`/leave/balances/${employeeId}`).send({});
    expect(res.status).toBe(401);
  });

  test('POST /leave/balances/:employeeId as manager is forbidden', async () => {
    const employeeId = await newEmployee();
    const res = await request(app).post(`/leave/balances/${employeeId}`).set('x-staff-role', 'manager').send({});
    expect(res.status).toBe(403);
  });

  test('GET /leave/balances/:employeeId with no x-staff-role header is unauthorized', async () => {
    const employeeId = await newEmployee();
    const res = await request(app).get(`/leave/balances/${employeeId}`);
    expect(res.status).toBe(401);
  });

  test('GET /leave/balances/:employeeId as an unrecognized role is forbidden', async () => {
    const employeeId = await newEmployee();
    const res = await request(app).get(`/leave/balances/${employeeId}`).set('x-staff-role', 'employee');
    expect(res.status).toBe(403);
  });

  test('GET /employees with no x-staff-role header is unauthorized', async () => {
    const res = await request(app).get('/employees');
    expect(res.status).toBe(401);
  });

  test('GET /employees as hr or manager succeeds', async () => {
    const hrRes = await request(app).get('/employees').set('x-staff-role', 'hr');
    expect(hrRes.status).toBe(200);
    const managerRes = await request(app).get('/employees').set('x-staff-role', 'manager');
    expect(managerRes.status).toBe(200);
  });
});

describe('self-access to a balance via x-employee-id', () => {
  test('GET /leave/balances/:employeeId: an employee may read their own balance', async () => {
    const employeeId = await newEmployee();
    await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 15, sick: 10, unpaid: 5 });
    const res = await request(app).get(`/leave/balances/${employeeId}`).set('x-employee-id', employeeId);
    expect(res.status).toBe(200);
    expect(res.body.balances.annual).toBe(15);
  });

  test('GET /leave/balances/:employeeId: an employee may not read someone else\'s balance', async () => {
    const employeeId = await newEmployee();
    const other = await newEmployee('Devon Ruiz');
    const res = await request(app).get(`/leave/balances/${other}`).set('x-employee-id', employeeId);
    expect(res.status).toBe(403);
  });
});
