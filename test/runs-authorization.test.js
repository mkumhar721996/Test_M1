const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, getRun } = require('../src/runs/store');
const { createHire, getHire } = require('../src/hires/store');

const hireData = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-01-01', department: 'Sales', role: 'AE', hireStage: 'draft' };

function blockedWorkflow() {
  return createWorkflow({
    tasks: [
      { id: 't1', name: 'Step One', next: ['t2'], requirement: { label: 'Doc', blockReason: 'missing' } },
      { id: 't2', name: 'Step Two', next: [] },
    ],
  });
}

describe('run mutation routes require a manager/HR role', () => {
  test.each(['advance', 'resolve-requirement'])('POST /runs/:id/%s without a role is 401 and changes nothing', async (action) => {
    const run = startRun(blockedWorkflow().workflowId);

    const res = await request(app).post(`/runs/${run.id}/${action}`).send({});

    expect(res.status).toBe(401);
    expect(getRun(run.id).status).toBe('active');
    expect(getRun(run.id).steps[0].requirementMet).toBe(false);
  });

  test.each(['advance', 'resolve-requirement'])('POST /runs/:id/%s with a non-permitted role is 403', async (action) => {
    const run = startRun(blockedWorkflow().workflowId);

    const res = await request(app).post(`/runs/${run.id}/${action}`).set('x-staff-role', 'front_desk').send({});

    expect(res.status).toBe(403);
    expect(getRun(run.id).steps[0].requirementMet).toBe(false);
  });

  test('the audit actor comes from the authenticated role, never from the request body', async () => {
    const hire = await createHire(hireData);
    const run = startRun(blockedWorkflow().workflowId, hire.id);

    await request(app).post(`/runs/${run.id}/resolve-requirement`).set('x-staff-role', 'hr').send({ actor: 'Priya Shah (HR)' });
    await request(app).post(`/runs/${run.id}/advance`).set('x-staff-role', 'manager').send({ actor: 'Priya Shah (HR)' });

    const actors = [...getRun(run.id).auditLog, ...getHire(hire.id).auditLog].map((e) => e.actor);
    expect(actors).not.toContain('Priya Shah (HR)');
    expect(getRun(run.id).auditLog.map((e) => e.actor)).toEqual(expect.arrayContaining(['HR', 'Manager']));
    expect(getHire(hire.id).auditLog.some((e) => e.actor === 'Manager')).toBe(true);
  });
});

describe('POST /workflows/:id/runs', () => {
  const start = (workflowId, role) => {
    const req = request(app).post(`/workflows/${workflowId}/runs`);
    return (role ? req.set('x-staff-role', role) : req);
  };

  test('without a role it is 401 and does not touch the hire record', async () => {
    const hire = await createHire(hireData);
    const before = getHire(hire.id).auditLog.length;
    const wf = blockedWorkflow();

    const res = await start(wf.workflowId).send({ hireId: hire.id });

    expect(res.status).toBe(401);
    expect(getHire(hire.id).auditLog).toHaveLength(before);
    expect(getHire(hire.id).onboardingStatus).toBeNull();
  });

  test('with a non-permitted role it is 403', async () => {
    const res = await start(blockedWorkflow().workflowId, 'front_desk').send({});

    expect(res.status).toBe(403);
  });

  test('a permitted role can start a run linked to an existing hire', async () => {
    const hire = await createHire(hireData);

    const res = await start(blockedWorkflow().workflowId, 'manager').send({ hireId: hire.id });

    expect(res.status).toBe(201);
    expect(res.body.hireId).toBe(hire.id);
    expect(getHire(hire.id).onboardingStatus).toBe('in_progress');
  });

  test('a permitted role can start a run with no hire', async () => {
    const res = await start(blockedWorkflow().workflowId, 'hr').send({});

    expect(res.status).toBe(201);
    expect(res.body.hireId).toBeNull();
  });

  test.each([123, { id: 'x' }, ['hire_2031']])('a non-string hireId (%j) is rejected with 400', async (hireId) => {
    const res = await start(blockedWorkflow().workflowId, 'manager').send({ hireId });

    expect(res.status).toBe(400);
  });

  test('a hireId that does not exist is rejected with 404', async () => {
    const res = await start(blockedWorkflow().workflowId, 'manager').send({ hireId: 'no-such-hire' });

    expect(res.status).toBe(404);
  });
});
