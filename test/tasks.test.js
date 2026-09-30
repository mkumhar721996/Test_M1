const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun } = require('../src/runs/store');
const { listTasks } = require('../src/tasks/store');

function createValidRunId() {
  const workflow = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
  const run = startRun(workflow.workflowId);
  return run.id;
}

test('AC1: POST /tasks with a valid runId returns 201 with an id and the provided runId', async () => {
  const runId = createValidRunId();
  const res = await request(app).post('/tasks').send({ runId });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ runId });
  expect(res.body.id).toBeTruthy();
});

test('AC2: POST /tasks with no runId returns 422', async () => {
  const res = await request(app).post('/tasks').send({});
  expect(res.status).toBe(422);
});

test('AC3: POST /tasks with an unknown runId returns 422', async () => {
  const res = await request(app).post('/tasks').send({ runId: 'does-not-exist' });
  expect(res.status).toBe(422);
});

test('AC4: a rejected POST /tasks (missing or unknown runId) persists nothing', async () => {
  const before = listTasks().length;
  await request(app).post('/tasks').send({});
  await request(app).post('/tasks').send({ runId: 'does-not-exist' });
  expect(listTasks().length).toBe(before);
});

test('AC5: malformed JSON body returns a 4xx with an error message', async () => {
  const res = await request(app)
    .post('/tasks')
    .set('Content-Type', 'application/json')
    .send('{ this is not valid json');
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(res.body.error).toEqual(expect.any(String));
});
