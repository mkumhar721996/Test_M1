const request = require('supertest');
const app = require('../src/server');
const { saveWorkflow } = require('../src/workflows/store');
const { startRun, getRun } = require('../src/runs/store');
const { sign } = require('../src/auth/tokens');

const TENANT = 'tenant-a';
const hrCoordinator = (tenantId, actorId = 'user-1') =>
  `Bearer ${sign({ actorId, role: 'hr_coordinator', tenantId })}`;

test('AC1: a run stays pinned to its original version and task graph after a later update', () => {
  const created = saveWorkflow({ tenantId: TENANT, definition: { tasks: [{ id: 't1', next: [] }] }, actor: 'user-1' });
  const run = startRun(TENANT, created.id);

  saveWorkflow({
    tenantId: TENANT,
    workflowId: created.id,
    definition: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] },
    actor: 'user-1',
  });

  const reloaded = getRun(TENANT, run.id);
  expect(reloaded.definitionVersion).toBe(1);
  expect(reloaded.definition).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('AC2: a run started after a definition update pins to the latest version at creation', () => {
  const created = saveWorkflow({ tenantId: TENANT, definition: { tasks: [{ id: 't1', next: [] }] }, actor: 'user-1' });
  saveWorkflow({
    tenantId: TENANT,
    workflowId: created.id,
    definition: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] },
    actor: 'user-1',
  });

  const run = startRun(TENANT, created.id);
  expect(run.definitionVersion).toBe(2);
  expect(run.definition).toEqual({ tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
});

test('AC1 (HTTP): an in-flight run is unaffected by a later definition update', async () => {
  const createRes = await request(app)
    .post('/workflows')
    .set('Authorization', hrCoordinator(TENANT))
    .send({ definition: { tasks: [{ id: 't1', next: [] }] } });
  const workflowId = createRes.body.id;

  const runRes = await request(app)
    .post(`/workflows/${workflowId}/runs`)
    .set('Authorization', hrCoordinator(TENANT))
    .send();
  expect(runRes.status).toBe(201);
  expect(runRes.body.definitionVersion).toBe(1);

  await request(app)
    .post('/workflows')
    .set('Authorization', hrCoordinator(TENANT))
    .send({ workflowId, definition: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });

  const getRes = await request(app)
    .get(`/runs/${runRes.body.id}`)
    .set('Authorization', hrCoordinator(TENANT));
  expect(getRes.body.definitionVersion).toBe(1);
  expect(getRes.body.definition).toEqual({ tasks: [{ id: 't1', next: [] }] });
});

test('AC2 (HTTP): a run created after an update is pinned to the new latest version', async () => {
  const createRes = await request(app)
    .post('/workflows')
    .set('Authorization', hrCoordinator(TENANT))
    .send({ definition: { tasks: [{ id: 't1', next: [] }] } });
  const workflowId = createRes.body.id;

  const updateRes = await request(app)
    .post('/workflows')
    .set('Authorization', hrCoordinator(TENANT))
    .send({ workflowId, definition: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });
  expect(updateRes.body.version).toBe(2);

  const runRes = await request(app)
    .post(`/workflows/${workflowId}/runs`)
    .set('Authorization', hrCoordinator(TENANT))
    .send();
  expect(runRes.body.definitionVersion).toBe(2);
  expect(runRes.body.definition).toEqual(updateRes.body.definition);
});

test('security: a run created under one tenant is not retrievable by another tenant', async () => {
  const createRes = await request(app)
    .post('/workflows')
    .set('Authorization', hrCoordinator(TENANT))
    .send({ definition: { tasks: [{ id: 't1', next: [] }] } });

  const runRes = await request(app)
    .post(`/workflows/${createRes.body.id}/runs`)
    .set('Authorization', hrCoordinator(TENANT))
    .send();

  const otherTenantRes = await request(app)
    .get(`/runs/${runRes.body.id}`)
    .set('Authorization', hrCoordinator('tenant-b'));
  expect(otherTenantRes.status).toBe(404);
});

test('security: fetching a run without a bearer token is rejected', async () => {
  const res = await request(app).get('/runs/some-run-id');
  expect(res.status).toBe(401);
});
