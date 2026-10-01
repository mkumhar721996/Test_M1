const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun } = require('../src/runs/store');
const { createHire, getHire, updateHire, deactivateHire, reactivateHire } = require('../src/hires/store');

const hireData = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer', hireStage: 'draft' };

test('AC4: a hire with no actions beyond creation has exactly one auditLog entry for create', async () => {
  const hire = await createHire(hireData, 'Morgan Ellis');
  expect(hire.auditLog).toHaveLength(1);
  expect(hire.auditLog[0]).toMatchObject({ actor: 'Morgan Ellis' });
  expect(typeof hire.auditLog[0].action).toBe('string');
});

test('AC2 + AC3: one audit entry per hire action, each with actor and action, none omitted', async () => {
  const hire = await createHire(hireData, 'Morgan Ellis');
  await updateHire(hire.id, { phone: '2' }, 'Morgan Ellis');
  const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
  startRun(wf.workflowId, hire.id);
  await deactivateHire(hire.id, 'Morgan Ellis');
  await reactivateHire(hire.id, 'Morgan Ellis');

  const reloaded = getHire(hire.id);
  expect(reloaded.auditLog).toHaveLength(5);
  reloaded.auditLog.forEach((entry) => {
    expect(typeof entry.actor).toBe('string');
    expect(entry.actor.length).toBeGreaterThan(0);
    expect(typeof entry.action).toBe('string');
    expect(entry.action.length).toBeGreaterThan(0);
  });
});

test('reactivating an already-active hire is a no-op and appends no extra entry', async () => {
  const hire = await createHire(hireData, 'Morgan Ellis');
  const result = await reactivateHire(hire.id, 'Morgan Ellis');
  expect(result.auditLog).toHaveLength(1);
});

test('an update that changes nothing appends no entry', async () => {
  const hire = await createHire(hireData, 'Morgan Ellis');
  await updateHire(hire.id, { phone: '1' }, 'Morgan Ellis');
  expect(getHire(hire.id).auditLog).toHaveLength(1);
});

test('AC1: GET /hires/:id returns the full auditLog in chronological order', async () => {
  const createRes = await request(app).post('/hires').send({ ...hireData, actor: 'Morgan Ellis' });
  const { id } = createRes.body;
  await request(app).patch(`/hires/${id}`).send({ phone: '2', actor: 'Morgan Ellis' });
  await request(app).post(`/hires/${id}/deactivate`).send({ actor: 'Morgan Ellis' });
  await request(app).post(`/hires/${id}/reactivate`).send({ actor: 'Morgan Ellis' });

  const res = await request(app).get(`/hires/${id}`);
  expect(res.status).toBe(200);
  expect(res.body.auditLog).toHaveLength(4);
  const timestamps = res.body.auditLog.map((e) => e.ts);
  expect(timestamps).toEqual([...timestamps].sort());
  res.body.auditLog.forEach((entry) => expect(entry.actor).toBe('Morgan Ellis'));
  expect(res.body.actor).toBeUndefined();
});
