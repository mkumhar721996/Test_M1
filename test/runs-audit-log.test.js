const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, getRun, advanceStep, resolveStepRequirement, pauseRun, resumeRun, cancelRun, failRun, completeRun } = require('../src/runs/store');
const auditLog = require('../src/runs/auditLog');
const { listAuditEntries, recordRunEvent, recordTaskEvent, TASK_EVENT_TYPES } = auditLog;

function twoStep() {
  return createWorkflow({ tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
}
function blockedFlow() {
  return createWorkflow({
    tasks: [
      { id: 't1', name: 'One', next: ['t2'], requirement: { label: 'Doc', blockReason: 'missing' } },
      { id: 't2', next: [] },
    ],
  });
}
const trail = (run) => listAuditEntries({ tenantId: run.tenantId, runId: run.id });

describe('run audit log', () => {
  test('AC1 started entry', () => {
    const run = startRun(twoStep().workflowId);
    const started = trail(run).find((e) => e.eventType === 'started');
    expect(started).toMatchObject({ kind: 'run', actor: 'System', priorState: null, newState: 'active' });
    expect(typeof started.ts).toBe('string');
  });

  test('AC1 completed entry carries acting role', () => {
    const run = startRun(createWorkflow({ tasks: [{ id: 't1', next: [] }] }).workflowId);
    advanceStep(run.id, 'Manager');
    expect(trail(run)).toContainEqual(
      expect.objectContaining({ kind: 'run', eventType: 'completed', actor: 'Manager', priorState: 'active', newState: 'completed' }),
    );
  });

  test('AC1 blocked then resumed', () => {
    const run = startRun(blockedFlow().workflowId);
    advanceStep(run.id);
    advanceStep(run.id);
    resolveStepRequirement(run.id);
    advanceStep(run.id, 'HR');
    expect(trail(run).filter((e) => e.kind === 'run').map((e) => e.eventType)).toEqual(['started', 'blocked', 'resumed']);
  });

  test('AC1 pause/resume/cancel/fail primitives', () => {
    const run = startRun(twoStep().workflowId);
    pauseRun(run.id, 'Manager');
    resumeRun(run.id, 'Manager');
    expect(trail(run).map((e) => e.eventType).filter((t) => t !== 'dispatched')).toEqual(['started', 'paused', 'resumed']);
    cancelRun(run.id);
    expect(getRun(run.id).status).toBe('cancelled');
    const runTypes = () => trail(run).filter((e) => e.kind === 'run').map((e) => e.eventType);
    expect(runTypes()).toEqual(['started', 'paused', 'resumed', 'cancelled']);
    pauseRun(run.id);
    expect(getRun(run.id).status).toBe('cancelled');
    expect(runTypes()).toEqual(['started', 'paused', 'resumed', 'cancelled']);
    const failed = startRun(twoStep().workflowId);
    failRun(failed.id);
    expect(trail(failed).some((e) => e.eventType === 'failed' && e.newState === 'failed')).toBe(true);
  });

  test.each(['cancelRun', 'failRun', 'pauseRun'])('advance/complete cannot resurrect a run after %s', (fn) => {
    const run = startRun(twoStep().workflowId);
    ({ cancelRun, failRun, pauseRun })[fn](run.id);
    const status = getRun(run.id).status;
    const before = trail(run).length;
    advanceStep(run.id);
    completeRun(run.id, {});
    expect(getRun(run.id).status).toBe(status);
    expect(trail(run).length).toBe(before);
  });

  test('AC2 dispatched/completed task entries', () => {
    const run = startRun(twoStep().workflowId);
    advanceStep(run.id);
    const tasks = trail(run).filter((e) => e.kind === 'task');
    expect(tasks).toContainEqual(expect.objectContaining({ taskId: 't1', eventType: 'dispatched' }));
    expect(tasks).toContainEqual(expect.objectContaining({ taskId: 't1', eventType: 'completed' }));
    expect(tasks).toContainEqual(expect.objectContaining({ taskId: 't2', eventType: 'dispatched' }));
  });

  test('AC2 blocked/retried', () => {
    const run = startRun(blockedFlow().workflowId);
    advanceStep(run.id);
    resolveStepRequirement(run.id);
    advanceStep(run.id);
    const events = trail(run).filter((e) => e.kind === 'task' && e.taskId === 't1').map((e) => e.eventType);
    expect(events).toEqual(['dispatched', 'blocked', 'retried', 'completed']);
  });

  test.each(TASK_EVENT_TYPES)('AC2 records a %s task event', (eventType) => {
    const entry = recordTaskEvent({ runId: 'run-x', tenantId: 'tenant-x', taskId: 'task-1', eventType });
    expect(entry).toMatchObject({ kind: 'task', taskId: 'task-1', eventType });
    expect(typeof entry.ts).toBe('string');
  });

  test('AC3 entries are frozen', () => {
    const entry = recordRunEvent({ runId: 'r1', tenantId: 'tenant-x', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    expect(Object.isFrozen(entry)).toBe(true);
    try { entry.actor = 'tampered'; } catch (e) { /* strict mode */ }
    const reread = listAuditEntries({ tenantId: 'tenant-x', runId: 'r1' }).find((e) => e.id === entry.id);
    expect(reread.actor).toBe('System');
  });

  test('AC3 no mutation API', () => {
    expect(auditLog.updateAuditEntry).toBeUndefined();
    expect(auditLog.deleteAuditEntry).toBeUndefined();
    expect(auditLog.clearAuditEntries).toBeUndefined();
  });

  test('AC4 terminal run and trail retained, no purge', () => {
    const run = startRun(createWorkflow({ tasks: [{ id: 't1', next: [] }] }).workflowId);
    advanceStep(run.id);
    expect(getRun(run.id).status).toBe('completed');
    const t = trail(run);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.some((e) => e.eventType === 'completed')).toBe(true);
    expect(auditLog.purgeAuditEntries).toBeUndefined();
  });

  test('AC5 tenant scoping at module level', () => {
    recordRunEvent({ runId: 'run-a', tenantId: 'tenant-1', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    recordRunEvent({ runId: 'run-b', tenantId: 'tenant-2', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    const t1 = listAuditEntries({ tenantId: 'tenant-1' });
    expect(t1.length).toBeGreaterThan(0);
    expect(t1.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    expect(() => listAuditEntries({})).toThrow();
  });

  test('AC5 tenant scoping over HTTP', async () => {
    const run = startRun(twoStep().workflowId, null, { tenantId: 'tenant-a' });
    const noRole = await request(app).get(`/runs/${run.id}/audit-log`).set('x-tenant-id', 'tenant-a');
    expect(noRole.status).toBe(401);
    const same = await request(app).get(`/runs/${run.id}/audit-log`).set('x-tenant-id', 'tenant-a').set('x-staff-role', 'hr');
    expect(same.status).toBe(200);
    expect(same.body.length).toBeGreaterThan(0);
    const other = await request(app).get(`/runs/${run.id}/audit-log`).set('x-tenant-id', 'tenant-b').set('x-staff-role', 'hr');
    expect(other.status).toBe(404);
  });

  test.each([{ tenantId: 5 }, { tenantId: '  ' }, { projectId: {} }])('POST /workflows/:id/runs rejects invalid scope %j', async (scope) => {
    const res = await request(app).post(`/workflows/${twoStep().workflowId}/runs`).set('x-staff-role', 'hr').send(scope);
    expect(res.status).toBe(400);
  });
});
