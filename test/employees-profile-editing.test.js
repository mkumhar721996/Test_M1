const request = require('supertest');
const app = require('../src/server');
const { createEmployee, getEmployee } = require('../src/employees/store');

const base = () => ({ name: 'Jordan Reyes', email: 'jordan.reyes@example.com', department: 'Engineering', role: 'Software Engineer II', startDate: '2026-09-20', employmentStatus: 'active' });

test.each(['hr', 'manager'])('AC1: %s can view a completed employee profile with all captured fields', async (role) => {
  const employee = createEmployee(base());
  const res = await request(app).get(`/employees/${employee.id}`).set('x-staff-role', role);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject(base());
});

test('AC2: a non-HR/Manager role requesting a profile is rejected and gets no profile data', async () => {
  const employee = createEmployee(base());
  const res = await request(app).get(`/employees/${employee.id}`).set('x-staff-role', 'team_member');
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
});

test('AC2: no x-staff-role header at all is rejected with 401', async () => {
  const employee = createEmployee(base());
  const res = await request(app).get(`/employees/${employee.id}`);
  expect(res.status).toBe(401);
});

test.each(['hr', 'manager'])('AC3: %s can update all six editable fields', async (role) => {
  const employee = createEmployee(base());
  const changes = { name: 'J. Reyes', email: 'new@example.com', department: 'Product', role: 'Senior Engineer', startDate: '2026-10-01', employmentStatus: 'on_leave' };
  const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', role).send(changes);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject(changes);
  expect(getEmployee(employee.id).role).toBe('Senior Engineer');
});

test('AC3: updating an unknown employee returns 404', async () => {
  const res = await request(app).patch('/employees/nope').set('x-staff-role', 'hr').send({ name: 'X' });
  expect(res.status).toBe(404);
});

test('AC4: a non-HR/Manager role submitting an update is rejected and the profile is unchanged', async () => {
  const employee = createEmployee(base());
  const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'team_member').send({ name: 'Changed' });
  expect(res.status).toBe(403);
  expect(getEmployee(employee.id).name).toBe('Jordan Reyes');
});

test('AC5: submitting a different id alongside an update leaves the employee id unchanged', async () => {
  const employee = createEmployee(base());
  const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'hr').send({ id: 'emp_9999', employeeId: 'emp_9999', role: 'Senior Engineer' });
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(employee.id);
  expect(res.body.employeeId).toBeUndefined();
  expect(res.body.role).toBe('Senior Engineer');
  expect(getEmployee(employee.id).id).toBe(employee.id);
});
