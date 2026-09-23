const crypto = require('crypto');
const request = require('supertest');

process.env.ACTOR_TOKEN_SECRET = 'test-actor-token-secret';

const app = require('../src/server');
const { listRunsForHire, getRun } = require('../src/runs/store');
const { addDefinitionVersion } = require('../src/workflows/store');
const { signActorToken } = require('../src/auth/actor');

function authHeaders(tenantId, role) {
  return { 'x-actor-token': signActorToken(tenantId, role) };
}

test('AC1: starting a Run for a new hire with no active Run creates it in the started state', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(tenantId, 'hr_coordinator'))
    .send({ hireId });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('started');
});

test('AC2: the created Run is pinned to the current published Workflow definition version', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  addDefinitionVersion(tenantId, { status: 'draft' });
  const published = addDefinitionVersion(tenantId, { status: 'published' });
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(tenantId, 'hiring_manager'))
    .send({ hireId });
  expect(res.body.workflowDefinitionVersionId).toBe(published.id);
});

test('AC3: the created Run is scoped to the initiating tenant', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(tenantId, 'hr_coordinator'))
    .send({ hireId });
  expect(res.body.tenantId).toBe(tenantId);
});

test('AC4: a duplicate start attempt is rejected with a structured DUPLICATE_ACTIVE_RUN error', async () => {
  const headers = authHeaders(crypto.randomUUID(), 'hr_coordinator');
  const hireId = crypto.randomUUID();
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  const second = await request(app).post('/runs').set(headers).send({ hireId });
  expect(second.status).toBe(409);
  expect(second.body.code).toBe('DUPLICATE_ACTIVE_RUN');
  expect(typeof second.body.message).toBe('string');
  expect(second.body.existing_run_id).toBe(first.body.id);
});

test('AC4: a duplicate start attempt is rejected while the existing Run is paused', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(first.body.id).status = 'paused';
  const second = await request(app).post('/runs').set(headers).send({ hireId });
  expect(second.status).toBe(409);
  expect(second.body.code).toBe('DUPLICATE_ACTIVE_RUN');
  expect(second.body.existing_run_id).toBe(first.body.id);
});

test('AC4: a duplicate start attempt is rejected while the existing Run is blocked', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(first.body.id).status = 'blocked';
  const second = await request(app).post('/runs').set(headers).send({ hireId });
  expect(second.status).toBe(409);
  expect(second.body.code).toBe('DUPLICATE_ACTIVE_RUN');
  expect(second.body.existing_run_id).toBe(first.body.id);
});

test('AC5: no additional Run is created after a rejected duplicate attempt', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  await request(app).post('/runs').set(headers).send({ hireId });
  await request(app).post('/runs').set(headers).send({ hireId });
  expect(listRunsForHire(tenantId, hireId)).toHaveLength(1);
});

test('AC6: a rehire can start a new Run once the prior Run is terminal', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(first.body.id).status = 'completed';
  const second = await request(app).post('/runs').set(headers).send({ hireId });
  expect(second.status).toBe(201);
  expect(second.body.id).not.toBe(first.body.id);
});

test('AC7: the prior Run remains retrievable in its terminal state', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(first.body.id).status = 'completed';
  await request(app).post('/runs').set(headers).send({ hireId });
  const priorRes = await request(app).get(`/runs/${first.body.id}`).set(headers);
  expect(priorRes.status).toBe(200);
  expect(priorRes.body.status).toBe('completed');
});

test('AC8: a queried Run is associated with its tenant', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const createRes = await request(app).post('/runs').set(headers).send({ hireId });
  const getRes = await request(app).get(`/runs/${createRes.body.id}`).set(headers);
  expect(getRes.body.tenantId).toBe(tenantId);
});

test('AC9: a different tenant is denied access to the Run', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const createRes = await request(app)
    .post('/runs')
    .set(authHeaders(tenantId, 'hr_coordinator'))
    .send({ hireId });
  const res = await request(app)
    .get(`/runs/${createRes.body.id}`)
    .set(authHeaders(crypto.randomUUID(), 'hr_coordinator'));
  expect(res.status).toBe(403);
});

test('AC10: an unauthorized role is rejected when starting a Run', async () => {
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(crypto.randomUUID(), 'employee'))
    .send({ hireId: crypto.randomUUID() });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('UNAUTHORIZED_ROLE');
});

test('AC11: concurrent start requests for the same hire create exactly one Run', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  await Promise.all([
    request(app).post('/runs').set(headers).send({ hireId }),
    request(app).post('/runs').set(headers).send({ hireId }),
  ]);
  expect(listRunsForHire(tenantId, hireId)).toHaveLength(1);
});

test('AC12: the losing concurrent request is rejected with DUPLICATE_ACTIVE_RUN', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const [a, b] = await Promise.all([
    request(app).post('/runs').set(headers).send({ hireId }),
    request(app).post('/runs').set(headers).send({ hireId }),
  ]);
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([201, 409]);
  const rejected = a.status === 409 ? a : b;
  expect(rejected.body.code).toBe('DUPLICATE_ACTIVE_RUN');
});

test('AC13: a tenant with no published version can still start a Run, pinned to the latest draft', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  addDefinitionVersion(tenantId, { status: 'draft' });
  const latestDraft = addDefinitionVersion(tenantId, { status: 'draft' });
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(tenantId, 'platform_admin'))
    .send({ hireId });
  expect(res.status).toBe(201);
  expect(res.body.workflowDefinitionVersionId).toBe(latestDraft.id);
});

test('additional: a missing actor token is rejected the same as an unauthorized role', async () => {
  const res = await request(app).post('/runs').send({ hireId: crypto.randomUUID() });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('UNAUTHORIZED_ROLE');
});

test('additional: a signed token with an empty tenant id is rejected with MISSING_TENANT_ID', async () => {
  const res = await request(app)
    .post('/runs')
    .set(authHeaders('', 'hr_coordinator'))
    .send({ hireId: crypto.randomUUID() });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('MISSING_TENANT_ID');
});

test('additional: a missing hireId in the request body is rejected with MISSING_HIRE_ID', async () => {
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(crypto.randomUUID(), 'hr_coordinator'))
    .send({});
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('MISSING_HIRE_ID');
});

test('additional: a non-string hireId is rejected with MISSING_HIRE_ID', async () => {
  const res = await request(app)
    .post('/runs')
    .set(authHeaders(crypto.randomUUID(), 'hr_coordinator'))
    .send({ hireId: { toString: () => 'x' } });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('MISSING_HIRE_ID');
});

test('additional: fetching a non-existent Run returns 404', async () => {
  const res = await request(app)
    .get(`/runs/${crypto.randomUUID()}`)
    .set(authHeaders(crypto.randomUUID(), 'hr_coordinator'));
  expect(res.status).toBe(404);
});

test('additional: a second rehire cycle also succeeds after the second Run reaches a terminal state', async () => {
  const tenantId = crypto.randomUUID();
  const hireId = crypto.randomUUID();
  const headers = authHeaders(tenantId, 'hr_coordinator');
  const first = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(first.body.id).status = 'completed';
  const second = await request(app).post('/runs').set(headers).send({ hireId });
  getRun(second.body.id).status = 'cancelled';
  const third = await request(app).post('/runs').set(headers).send({ hireId });
  expect(third.status).toBe(201);
  expect(listRunsForHire(tenantId, hireId)).toHaveLength(3);
});

test('security: forged raw x-tenant-id/x-actor-role headers without a valid signed token are rejected', async () => {
  const res = await request(app)
    .post('/runs')
    .set({ 'x-tenant-id': crypto.randomUUID(), 'x-actor-role': 'platform_admin' })
    .send({ hireId: crypto.randomUUID() });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('UNAUTHORIZED_ROLE');
});

test('security: a token signed with the wrong secret is rejected even for an allowed role', async () => {
  const tenantId = crypto.randomUUID();
  const forgedToken = `${Buffer.from(`${tenantId}:platform_admin`).toString('base64')}.deadbeef`;
  const res = await request(app)
    .post('/runs')
    .set({ 'x-actor-token': forgedToken })
    .send({ hireId: crypto.randomUUID() });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('UNAUTHORIZED_ROLE');
});
