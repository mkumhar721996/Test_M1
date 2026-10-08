const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, applyCheckSignal } = require('../src/runs/store');

const SERVICE_KEY = 'test-service-key';
beforeAll(() => {
  process.env.CHECK_SIGNAL_SECRET = SERVICE_KEY;
});

function gateRun(extra = []) {
  const wf = createWorkflow({
    tasks: [
      { id: 't1', name: 'Background check', next: extra.length ? ['t2'] : [], requirement: { label: 'Background check', checkType: 'gate' } },
      ...extra,
    ],
  });
  return startRun(wf.workflowId);
}

test('AC1: a pass signal marks the depending task complete', () => {
  const run = gateRun([{ id: 't2', name: 'Step Two', next: [] }]);
  expect(applyCheckSignal(run.id, 't1', 'pass').steps[0].status).toBe('done');
});

test('AC2: a pass signal advances the run to the next task', () => {
  const run = gateRun([{ id: 't2', name: 'Step Two', next: [] }]);
  const updated = applyCheckSignal(run.id, 't1', 'pass');
  expect(updated.currentIndex).toBe(1);
  expect(updated.steps[1].status).toBe('current');
  expect(updated.status).toBe('active');
});

test('AC2 (final task): a pass signal on the last task completes the run', () => {
  const run = gateRun();
  const updated = applyCheckSignal(run.id, 't1', 'pass');
  expect(updated.status).toBe('completed');
  expect(updated.steps[0].status).toBe('done');
});

test('AC3: a not-pass signal moves the depending task to blocked', () => {
  const wf = createWorkflow({
    tasks: [{ id: 't1', name: 'I-9 document check', next: [], requirement: { label: 'I-9', checkType: 'document-check' } }],
  });
  const run = startRun(wf.workflowId);
  const updated = applyCheckSignal(run.id, 't1', 'not-pass');
  expect(updated.steps[0].status).toBe('blocked');
  expect(updated.status).toBe('blocked');
  expect(updated.currentIndex).toBe(0);
});

test('AC4: the audit entry records only the pass/not-pass outcome', () => {
  const run = gateRun();
  const updated = applyCheckSignal(run.id, 't1', 'not-pass');
  const entry = updated.auditLog[updated.auditLog.length - 1];
  expect(entry.action).toBe('gate check signal received for step 1 of 1 (Background check): not-pass.');
});

test('AC5: extra check-detail fields sent with the signal are ignored', async () => {
  const run = gateRun();
  const res = await request(app)
    .post(`/runs/${run.id}/tasks/t1/signal`)
    .set('x-service-key', SERVICE_KEY)
    .send({ outcome: 'not-pass', reason: 'candidate failed credit check', evaluatedBy: 'external-vendor', score: 42 });
  expect(res.status).toBe(200);
  expect(res.body.steps[0].status).toBe('blocked');
  const entry = res.body.auditLog[res.body.auditLog.length - 1];
  expect(entry.action).toBe('gate check signal received for step 1 of 1 (Background check): not-pass.');
  expect(entry.action).not.toMatch(/credit check|external-vendor/);
});

test('unknown run id is 404', async () => {
  const res = await request(app).post('/runs/does-not-exist/tasks/t1/signal').set('x-service-key', SERVICE_KEY).send({ outcome: 'pass' });
  expect(res.status).toBe(404);
});

test('an invalid outcome value is 400', async () => {
  const run = gateRun();
  const res = await request(app).post(`/runs/${run.id}/tasks/t1/signal`).set('x-service-key', SERVICE_KEY).send({ outcome: 'maybe' });
  expect(res.status).toBe(400);
});

test('a signal for a task with no configured checkType is a no-op', () => {
  const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Manual step', next: [] }] });
  const run = startRun(wf.workflowId);
  expect(applyCheckSignal(run.id, 't1', 'pass').steps[0].status).toBe('current');
});

test('a signal without a service key is 401 and a wrong key is 403', async () => {
  const run = gateRun();
  const url = `/runs/${run.id}/tasks/t1/signal`;
  expect((await request(app).post(url).send({ outcome: 'pass' })).status).toBe(401);
  expect((await request(app).post(url).set('x-service-key', 'wrong-key').send({ outcome: 'pass' })).status).toBe(403);
});

test('a signal for a non-current task is ignored', () => {
  const wf = createWorkflow({
    tasks: [
      { id: 't1', name: 'One', next: ['t2'] },
      { id: 't2', name: 'Two', next: ['t3'], requirement: { label: 'Two', checkType: 'gate' } },
      { id: 't3', name: 'Three', next: [], requirement: { label: 'Three', checkType: 'gate' } },
    ],
  });
  const run = startRun(wf.workflowId);
  const updated = applyCheckSignal(run.id, 't3', 'pass');
  expect(updated.status).toBe('active');
  expect(updated.steps[2].status).toBe('upcoming');
  expect(applyCheckSignal(run.id, 't2', 'not-pass').steps[1].status).toBe('upcoming');
});

test('a signal on a completed run is ignored', () => {
  const run = gateRun();
  applyCheckSignal(run.id, 't1', 'pass');
  const updated = applyCheckSignal(run.id, 't1', 'not-pass');
  expect(updated.status).toBe('completed');
  expect(updated.steps[0].status).toBe('done');
});

test('not-pass then pass recovers the run; repeated not-pass is idempotent', () => {
  const run = gateRun([{ id: 't2', name: 'Step Two', next: [] }]);
  applyCheckSignal(run.id, 't1', 'not-pass');
  const logLen = applyCheckSignal(run.id, 't1', 'not-pass').auditLog.length;
  expect(logLen).toBe(2);
  const updated = applyCheckSignal(run.id, 't1', 'pass');
  expect(updated.status).toBe('active');
  expect(updated.currentIndex).toBe(1);
  expect(updated.steps[0].status).toBe('done');
});
