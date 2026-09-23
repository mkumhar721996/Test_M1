const { createRun, recordTaskFailure, resolveTask, getRunDetail } = require('../src/runs/store');

function makeRun(overrides = {}) {
  return createRun({
    name: 'Onboarding: Test User',
    tasks: [{ name: 'Provision laptop asset', hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } }],
    ...overrides,
  });
}

function findTask(detail, taskId) {
  return detail.tasks.find((t) => t.id === taskId);
}

test('AC1: first failure schedules a retry with nextRetryAt ~30s out', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  const detail = recordTaskFailure(run.id, taskId, 'Vendor API timeout (504)');
  const task = findTask(detail, taskId);
  expect(new Date(task.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(29000);
});

test('AC1: second failure schedules a longer backoff than the first', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'x');
  const detail = recordTaskFailure(run.id, taskId, 'x');
  const task = findTask(detail, taskId);
  expect(new Date(task.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(119000);
});

test('AC2: task state is retrying (not blocked/pending) after the 1st and 2nd failures', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  const first = recordTaskFailure(run.id, taskId, 'x');
  expect(findTask(first, taskId).state).toBe('retrying');
  const second = recordTaskFailure(run.id, taskId, 'x');
  expect(findTask(second, taskId).state).toBe('retrying');
  expect(second.state).toBe('in-progress');
});

test('AC3: the third failure blocks both the task and its parent Run', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'x');
  recordTaskFailure(run.id, taskId, 'x');
  const detail = recordTaskFailure(run.id, taskId, 'Vendor API timeout (504)');
  const task = findTask(detail, taskId);
  expect(task.state).toBe('blocked');
  expect(detail.state).toBe('blocked');
  expect(task.attempts).toBe(3);
});

test('AC4: the third failure notifies the assigned HR coordinator in-app', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'x');
  recordTaskFailure(run.id, taskId, 'x');
  const detail = recordTaskFailure(run.id, taskId, 'Vendor API timeout (504)');
  expect(detail.notifications.some((n) => n.text.includes('Provision laptop asset'))).toBe(true);
});

test('AC5: resolving a blocked task returns it and its Run to in-progress', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'x');
  recordTaskFailure(run.id, taskId, 'x');
  recordTaskFailure(run.id, taskId, 'x');

  const detail = resolveTask(run.id, taskId, { resolver: 'Priya Nair — HR Coordinator', note: 'Fixed manually' });
  expect(findTask(detail, taskId).state).toBe('in-progress');
  expect(detail.state).toBe('in-progress');
});

test('AC5: resolving a task that is not blocked is rejected', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  expect(() => resolveTask(run.id, taskId, { resolver: 'x', note: 'y' })).toThrow();
});

test('AC6: retry and block events are written to the audit log with attempt, reason, and timestamp', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'Vendor API timeout (504)');
  const detail = getRunDetail(run.id);
  const entry = detail.auditLog.find((e) => e.taskId === taskId);
  expect(entry.attempt).toBe(1);
  expect(entry.reason).toBe('Vendor API timeout (504)');
  expect(entry.timestamp).toBeDefined();
});

test('getRunDetail composes tasks, auditLog, and notifications for the run', () => {
  const run = makeRun();
  const taskId = run.tasks[0].id;
  recordTaskFailure(run.id, taskId, 'x');
  const detail = getRunDetail(run.id);
  expect(detail.id).toBe(run.id);
  expect(detail.auditLog.length).toBeGreaterThan(0);
  expect(Array.isArray(detail.notifications)).toBe(true);
});
