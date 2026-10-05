const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { createHire } = require('../src/hires/store');
const { startRun, advanceStep, getRun } = require('../src/runs/store');
const { getEmployee } = require('../src/employees/store');

const fullHireData = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  department: 'Engineering',
  role: 'Software Engineer',
  startDate: '2026-01-01',
  phone: '555-0100',
};

function oneStepWorkflow() {
  return createWorkflow({ tasks: [{ id: 't1', next: [] }] });
}

function twoStepWorkflow() {
  return createWorkflow({ tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
}

async function startLinkedRun(overrides = {}, workflow = oneStepWorkflow()) {
  const hire = await createHire({ ...fullHireData, ...overrides });
  return startRun(workflow.workflowId, hire.id);
}

test('AC1: completing the final step creates an employee with no separate action', async () => {
  const run = await startLinkedRun();
  const completed = advanceStep(run.id);
  expect(completed.status).toBe('completed');
  expect(completed.employeeId).toBeTruthy();
  expect(getEmployee(completed.employeeId)).toBeDefined();
});

test('AC2: employee is populated from the hire profile', async () => {
  const run = await startLinkedRun();
  const employee = getEmployee(advanceStep(run.id).employeeId);
  expect(employee).toMatchObject({
    name: fullHireData.name,
    email: fullHireData.email,
    department: fullHireData.department,
    role: fullHireData.role,
    startDate: fullHireData.startDate,
    phone: fullHireData.phone,
  });
  expect(employee.incompleteFields).toBeUndefined();
});

test('AC3: a missing required field is flagged incomplete without blocking creation', async () => {
  const run = await startLinkedRun({ email: undefined });
  const employee = getEmployee(advanceStep(run.id).employeeId);
  expect(employee).toBeDefined();
  expect(employee.incompleteFields).toContain('email');
});

test('AC4: hiring-process data is excluded from the employee record', async () => {
  const run = await startLinkedRun({ hireStage: 'offer_accepted_pending' });
  const employee = getEmployee(advanceStep(run.id).employeeId);
  expect(employee.hireStage).toBeUndefined();
  expect(employee.runHistory).toBeUndefined();
  expect(employee.auditLog).toBeUndefined();
});

test('AC5: completing a non-final step creates no employee', async () => {
  const run = await startLinkedRun({}, twoStepWorkflow());
  const advanced = advanceStep(run.id);
  expect(advanced.status).toBe('active');
  expect(advanced.employeeId).toBeFalsy();
});

test('AC6: the retired /complete endpoint returns an error', async () => {
  const run = await startLinkedRun();
  const res = await request(app).post(`/runs/${run.id}/complete`).send({});
  expect(res.status).toBe(410);
  expect(res.body.error).toMatch(/no longer available/i);
  expect(getRun(run.id).status).not.toBe('completed');
});

test('AC7: repeat final-step completion does not create another employee', async () => {
  const run = await startLinkedRun();
  const first = advanceStep(run.id);
  const firstEmployeeId = first.employeeId;
  const second = advanceStep(run.id);
  expect(second.employeeId).toBe(firstEmployeeId);
  expect(second).toEqual(first);
});

test('AC8: the existing employee record is unchanged after repeat completion', async () => {
  const run = await startLinkedRun();
  const first = advanceStep(run.id);
  const before = { ...getEmployee(first.employeeId) };
  advanceStep(run.id);
  expect(getEmployee(first.employeeId)).toEqual(before);
});

test('AC9: a hire missing only phone is not flagged for phone', async () => {
  const run = await startLinkedRun({ phone: undefined });
  const employee = getEmployee(advanceStep(run.id).employeeId);
  expect(employee.incompleteFields || []).not.toContain('phone');
  expect(employee.phone).toBeUndefined();
});

test('AC10: incomplete record creation emits no error/warn noise', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const run = await startLinkedRun({ email: undefined });
  advanceStep(run.id);
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});
