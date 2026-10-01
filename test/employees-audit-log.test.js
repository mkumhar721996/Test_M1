const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, completeRun } = require('../src/runs/store');
const { createEmployee, getEmployee } = require('../src/employees/store');

test('AC4 + AC2: an employee has exactly one create auditLog entry identifying actor and action', () => {
  const employee = createEmployee({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer', actor: 'should-not-leak' }, 'Priya Shah');
  expect(employee.auditLog).toHaveLength(1);
  expect(employee.auditLog[0]).toMatchObject({ actor: 'Priya Shah' });
  expect(typeof employee.auditLog[0].action).toBe('string');
  expect(employee.actor).toBeUndefined();
});

test('AC1: GET /employees/:id returns the full auditLog', async () => {
  const createRes = await request(app).post('/employees').send({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer', actor: 'Priya Shah' });
  const getRes = await request(app).get(`/employees/${createRes.body.id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body.auditLog).toHaveLength(1);
  expect(getRes.body.auditLog[0]).toMatchObject({ actor: 'Priya Shah' });
});

test('AC3: a run-completion-created employee has exactly one create entry attributed to System', () => {
  const wf = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  const run = startRun(wf.workflowId);
  const completed = completeRun(run.id, { name: 'Ada Lovelace', email: 'ada@example.com', department: 'Engineering', role: 'Software Engineer', startDate: '2026-01-01' });
  const employee = getEmployee(completed.employeeId);
  expect(employee.auditLog).toHaveLength(1);
  expect(employee.auditLog[0]).toMatchObject({ actor: 'System' });
});
