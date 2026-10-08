const request = require('supertest');
const app = require('../src/server');
const { createWorkflow, updateWorkflow, getLatestVersion, getVersion } = require('../src/workflows/store');

test('createWorkflow starts a new workflow at version 1', () => {
  const definition = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  expect(definition.version).toBe(1);
  expect(definition.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('updateWorkflow appends a new version without mutating the prior one', () => {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  const updated = updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

  expect(updated.version).toBe(2);
  const original = getVersion(created.workflowId, 1);
  expect(original.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('getLatestVersion reflects the most recent update', () => {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

  const latest = getLatestVersion(created.workflowId);
  expect(latest.version).toBe(2);
});

test('getLatestVersion returns a clone, so mutating it cannot corrupt the store', () => {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  const latest = getLatestVersion(created.workflowId);
  latest.taskGraph.tasks.push({ id: 'intruder', next: [] });

  const reread = getLatestVersion(created.workflowId);
  expect(reread.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

const g1 = { tasks: [{ id: 't1', next: [] }] };
const g2 = { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] };
const hr = (r) => r.set('x-staff-role', 'hr_coordinator');

test('AC1/AC8: a new workflow definition is persisted as version 1 and records actor + timestamp', () => {
  const definition = createWorkflow(g1, { actor: 'HR Coordinator' });
  expect(definition.version).toBe(1);
  expect(definition.savedBy).toBe('HR Coordinator');
  expect(Number.isNaN(new Date(definition.savedAt).getTime())).toBe(false);
});

test('AC8: updates record actor, timestamp and version', () => {
  const created = createWorkflow(g1);
  const updated = updateWorkflow(created.workflowId, g2, { actor: 'Platform Admin' });
  expect(updated).toMatchObject({ version: 2, savedBy: 'Platform Admin' });
  expect(Number.isNaN(new Date(updated.savedAt).getTime())).toBe(false);
});

test('AC2: the newly saved version can immediately be used to start a new Run', async () => {
  const created = await hr(request(app).post('/workflows')).send({ taskGraph: g1 });
  const runRes = await request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'manager').send();
  expect(runRes.status).toBe(201);
  expect(runRes.body.definitionVersion).toBe(1);
});

test('AC3/AC4: saving an update assigns a new version and the prior stays accessible', async () => {
  const created = await hr(request(app).post('/workflows')).send({ taskGraph: g1 });
  const updated = await hr(request(app).post(`/workflows/${created.body.id}/versions`)).send({ taskGraph: g2 });
  expect(updated.status).toBe(201);
  expect(updated.body.version).toBe(2);
  const prior = await request(app).get(`/workflows/${created.body.id}/versions/1`).set('x-user-id', 'someone');
  expect(prior.status).toBe(200);
  expect(prior.body.taskGraph).toEqual(g1);
});

test('AC5: an in-flight Run keeps its original task graph after the workflow is updated', async () => {
  const created = await hr(request(app).post('/workflows')).send({ taskGraph: g1 });
  const runRes = await request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'manager').send();
  await hr(request(app).post(`/workflows/${created.body.id}/versions`)).send({ taskGraph: g2 });
  const getRunRes = await request(app).get(`/runs/${runRes.body.id}`);
  expect(getRunRes.body.definitionVersion).toBe(1);
  expect(getRunRes.body.taskGraph).toEqual(g1);
});

test('AC6/AC7: an invalid update is rejected with a 400 and creates no new version', async () => {
  const created = await hr(request(app).post('/workflows')).send({ taskGraph: g1 });
  const res = await hr(request(app).post(`/workflows/${created.body.id}/versions`)).send({ taskGraph: { tasks: [{ id: 't1', next: ['missing'] }] } });
  expect(res.status).toBe(400);
  expect(res.body.fields['tasks[0].next[0]']).toMatch(/missing/);
  expect(getLatestVersion(created.body.id).version).toBe(1);
});

test('AC6/AC7: an invalid create is rejected with a 400', async () => {
  const res = await hr(request(app).post('/workflows')).send({ taskGraph: { tasks: [] } });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
});
