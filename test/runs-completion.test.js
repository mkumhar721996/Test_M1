const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, completeRun } = require('../src/runs/store');
const { getEmployee } = require('../src/employees/store');

const fullPayload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  department: 'Engineering',
  role: 'Software Engineer',
  startDate: '2026-01-01',
};

function startTestRun() {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  return startRun(created.workflowId);
}

test('AC1 + AC2: completing a run with a full staff payload creates a linked, active employee', () => {
  const run = startTestRun();

  const completed = completeRun(run.id, fullPayload);

  expect(completed.status).toBe('completed');
  expect(completed.employeeId).toBeTruthy();
  const employee = getEmployee(completed.employeeId);
  expect(employee.employmentStatus).toBe('active');
});

test('AC3: the created employee data fields equal exactly the payload fields', () => {
  const run = startTestRun();

  const completed = completeRun(run.id, fullPayload);
  const employee = getEmployee(completed.employeeId);
  const { id, employmentStatus, ...rest } = employee;

  expect(rest).toEqual(fullPayload);
});

test('AC4: a run that is only started, never completed, never gets an employee', () => {
  const run = startTestRun();

  expect(run.status).toBe('active');
  expect(run.employeeId).toBeFalsy();
});

test('AC5: a duplicate completion of the same run does not create a second employee', () => {
  const run = startTestRun();

  const first = completeRun(run.id, fullPayload);
  const second = completeRun(run.id, { ...fullPayload, name: 'Changed Name' });

  expect(second.employeeId).toBe(first.employeeId);
  expect(getEmployee(first.employeeId).name).toBe('Ada Lovelace');
});

test('AC6: a completion payload missing a required field creates no employee', () => {
  const run = startTestRun();
  const incomplete = { name: 'No Email', department: 'Engineering', role: 'Engineer', startDate: '2026-01-01' };

  const result = completeRun(run.id, incomplete);

  expect(result.employeeId).toBeFalsy();
});

test('AC7: a missing-field completion logs an error', () => {
  const run = startTestRun();
  const incomplete = { name: 'No Email', department: 'Engineering', role: 'Engineer', startDate: '2026-01-01' };
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const result = completeRun(run.id, incomplete);

  expect(spy).toHaveBeenCalledTimes(1);
  expect(result.employeeId).toBeFalsy();
  spy.mockRestore();
});

test('AC8: hitting the completion endpoint with a missing-fields payload still returns 200, not an error', async () => {
  const createRes = await request(app).post('/workflows').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
  const workflowId = createRes.body.id;
  const runRes = await request(app).post(`/workflows/${workflowId}/runs`).set('x-staff-role', 'manager').send();

  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await request(app).post(`/runs/${runRes.body.id}/complete`).send({ name: 'Incomplete' });
  spy.mockRestore();

  expect(res.status).toBe(200);
  expect(res.body.error).toBeUndefined();
});
