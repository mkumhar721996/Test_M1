const request = require('supertest');
const app = require('../src/server');

const validDefinition = {
  tasks: [{ id: 'send_offer' }, { id: 'collect_docs' }],
  sequencing: [{ from: 'send_offer', to: 'collect_docs' }],
};

test('AC1: saving a new workflow definition persists it as version 1', async () => {
  const res = await request(app)
    .post('/workflows')
    .set('x-tenant-id', 'tenant-a')
    .set('x-actor-role', 'hr_coordinator')
    .set('x-actor-id', 'user-1')
    .send({ definition: validDefinition });
  expect(res.status).toBe(201);
  expect(res.body.version).toBe(1);
});

test('AC2: the new version is immediately retrievable for starting new runs', async () => {
  const createRes = await request(app)
    .post('/workflows')
    .set('x-tenant-id', 'tenant-a')
    .set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const getRes = await request(app)
    .get(`/workflows/${createRes.body.id}`)
    .set('x-tenant-id', 'tenant-a');
  expect(getRes.status).toBe(200);
  expect(getRes.body.version).toBe(1);
  expect(getRes.body.definition).toEqual(validDefinition);
});

test('AC3: saving an update assigns a new version number', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const updateRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ workflowId: createRes.body.id, definition: { tasks: [{ id: 'send_offer' }] } });
  expect(updateRes.status).toBe(201);
  expect(updateRes.body.version).toBe(2);
});

test('AC4: the prior version remains accessible after an update', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const { id } = createRes.body;
  await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ workflowId: id, definition: { tasks: [{ id: 'send_offer' }] } });

  const v1Res = await request(app).get(`/workflows/${id}/versions/1`).set('x-tenant-id', 'tenant-a');
  expect(v1Res.status).toBe(200);
  expect(v1Res.body.definition).toEqual(validDefinition);
});

test('AC5: a version already pinned before an update is unaffected by that update', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const pinned = createRes.body; // simulates a Run resolving to this version at start time

  await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ workflowId: pinned.id, definition: { tasks: [{ id: 'send_offer' }] } });

  const refetched = await request(app)
    .get(`/workflows/${pinned.id}/versions/${pinned.version}`)
    .set('x-tenant-id', 'tenant-a');
  expect(refetched.body.definition).toEqual(pinned.definition);
});

test('AC6: an invalid definition is rejected with a 400 identifying the invalid element', async () => {
  const res = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: { tasks: [{ id: 'a' }], sequencing: [{ from: 'a', to: 'missing' }] } });
  expect(res.status).toBe(400);
  expect(res.body.details[0].field).toBe('sequencing[0].to');
});

test('AC7: a rejected save does not create a new version', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const { id } = createRes.body;

  await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ workflowId: id, definition: { tasks: [{ id: 'a' }], sequencing: [{ from: 'a', to: 'missing' }] } });

  const getRes = await request(app).get(`/workflows/${id}`).set('x-tenant-id', 'tenant-a');
  expect(getRes.body.version).toBe(1);
});

test('AC8: a saved workflow records the actor, timestamp, and version number', async () => {
  const res = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator').set('x-actor-id', 'user-42')
    .send({ definition: validDefinition });
  expect(res.body.savedBy).toBe('user-42');
  expect(res.body.version).toBe(1);
  expect(Number.isNaN(new Date(res.body.savedAt).getTime())).toBe(false);
});

test('AC9: a workflow is retrievable within the tenant it was created under', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const getRes = await request(app).get(`/workflows/${createRes.body.id}`).set('x-tenant-id', 'tenant-a');
  expect(getRes.status).toBe(200);
});

test('AC10: a workflow created under one tenant is not visible to another tenant', async () => {
  const createRes = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
    .send({ definition: validDefinition });
  const otherTenantRes = await request(app)
    .get(`/workflows/${createRes.body.id}`)
    .set('x-tenant-id', 'tenant-b');
  expect(otherTenantRes.status).toBe(404);
});

test('AC11: an unauthorized role cannot save a workflow definition', async () => {
  const res = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'employee')
    .send({ definition: validDefinition });
  expect(res.status).toBe(403);
});

test('AC11: a request with platform_admin role is authorized to save', async () => {
  const res = await request(app).post('/workflows')
    .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'platform_admin')
    .send({ definition: validDefinition });
  expect(res.status).toBe(201);
});
