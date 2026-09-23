const request = require('supertest');
const app = require('../src/server');
const { createWorkflow, updateWorkflow } = require('../src/workflows/store');
const { startRun, getRun } = require('../src/runs/store');

test('AC1: a run stays pinned to its original version and task graph after a later update', () => {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  const run = startRun(created.workflowId);

  updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

  const reloaded = getRun(run.id);
  expect(reloaded.definitionVersion).toBe(1);
  expect(reloaded.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('AC2: a run started after a definition update pins to the latest version at creation', () => {
  const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

  const run = startRun(created.workflowId);
  expect(run.definitionVersion).toBe(2);
  expect(run.taskGraph).toEqual({ tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
});

test('AC1 (HTTP): an in-flight run is unaffected by a later definition update', async () => {
  const createRes = await request(app).post('/workflows').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
  const workflowId = createRes.body.id;

  const runRes = await request(app).post(`/workflows/${workflowId}/runs`).send();
  expect(runRes.status).toBe(201);
  expect(runRes.body.definitionVersion).toBe(1);

  await request(app)
    .post(`/workflows/${workflowId}/versions`)
    .send({ taskGraph: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });

  const getRes = await request(app).get(`/runs/${runRes.body.id}`);
  expect(getRes.body.definitionVersion).toBe(1);
  expect(getRes.body.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('AC2 (HTTP): a run created after an update is pinned to the new latest version', async () => {
  const createRes = await request(app).post('/workflows').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
  const workflowId = createRes.body.id;

  const updateRes = await request(app)
    .post(`/workflows/${workflowId}/versions`)
    .send({ taskGraph: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });
  expect(updateRes.body.version).toBe(2);

  const runRes = await request(app).post(`/workflows/${workflowId}/runs`).send();
  expect(runRes.body.definitionVersion).toBe(2);
  expect(runRes.body.taskGraph).toEqual(updateRes.body.taskGraph);
});
