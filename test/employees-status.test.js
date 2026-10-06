const request = require('supertest');
const app = require('../src/server');
const { createEmployee, getEmployee, deactivateEmployee, reactivateEmployee } = require('../src/employees/store');

function newEmployee(status = 'active') {
  return createEmployee({ name: 'Marcus Chen', email: 'marcus@example.com', employmentStatus: status });
}

describe.each(['hr', 'manager'])('role %s', (role) => {
  test('AC1: deactivates an active employee', async () => {
    const employee = newEmployee('active');
    const res = await request(app).post(`/employees/${employee.id}/deactivate`).set('x-staff-role', role).send({});
    expect(res.status).toBe(200);
    expect(res.body.employmentStatus).toBe('deactivated');
    expect(getEmployee(employee.id).employmentStatus).toBe('deactivated');
  });

  test('AC2: reactivates a deactivated employee', async () => {
    const employee = newEmployee('deactivated');
    const res = await request(app).post(`/employees/${employee.id}/reactivate`).set('x-staff-role', role).send({});
    expect(res.status).toBe(200);
    expect(res.body.employmentStatus).toBe('active');
    expect(getEmployee(employee.id).employmentStatus).toBe('active');
  });
});

test.each(['deactivate', 'reactivate'])('AC3/AC4: %s is rejected for other roles and leaves status unchanged', async (action) => {
  const employee = newEmployee(action === 'deactivate' ? 'active' : 'deactivated');
  const originalStatus = employee.employmentStatus;

  const res = await request(app).post(`/employees/${employee.id}/${action}`).set('x-staff-role', 'employee').send({});
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
  expect(getEmployee(employee.id).employmentStatus).toBe(originalStatus);

  const noHeaderRes = await request(app).post(`/employees/${employee.id}/${action}`).send({});
  expect(noHeaderRes.status).toBe(401);
  expect(getEmployee(employee.id).employmentStatus).toBe(originalStatus);
});

test('unknown employee returns 404', async () => {
  const res = await request(app).post('/employees/nope/deactivate').set('x-staff-role', 'hr').send({});
  expect(res.status).toBe(404);
});

test('AC5: no generic route writes employmentStatus and history records only manual actions', async () => {
  const employee = newEmployee('active');
  expect(employee.history).toBeUndefined();
  const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'hr').send({ employmentStatus: 'deactivated' });
  expect(res.status).toBe(404);
  expect(getEmployee(employee.id).employmentStatus).toBe('active');

  deactivateEmployee(employee.id, 'HR');
  reactivateEmployee(employee.id, 'Manager');
  expect(getEmployee(employee.id).history).toEqual([
    { status: 'deactivated', actor: 'HR', at: expect.any(String) },
    { status: 'active', actor: 'Manager', at: expect.any(String) },
  ]);
});

test('AC6: a deactivated employee stays fully viewable without a role header', async () => {
  const employee = newEmployee('active');
  deactivateEmployee(employee.id, 'HR');
  const res = await request(app).get(`/employees/${employee.id}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ name: 'Marcus Chen', email: employee.email, employmentStatus: 'deactivated' });
});

test('GET /employees lists employees ungated', async () => {
  const employee = newEmployee('active');
  const res = await request(app).get('/employees');
  expect(res.status).toBe(200);
  expect(res.body.map((e) => e.id)).toContain(employee.id);
});
