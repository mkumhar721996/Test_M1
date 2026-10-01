const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, advanceStep, resolveStepRequirement, getRun, listRuns } = require('../src/runs/store');
const { createHire, getHire } = require('../src/hires/store');

const hireData = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-01-01', department: 'Sales', role: 'AE', hireStage: 'draft' };

function twoStepWorkflow(firstExtras = {}) {
  return createWorkflow({
    tasks: [
      { id: 't1', name: 'Step One', next: ['t2'], ...firstExtras },
      { id: 't2', name: 'Step Two', next: [] },
    ],
  });
}

const blockingRequirement = { label: 'Doc', blockReason: 'missing' };

test('AC1: completing the current step advances the run to the next task', () => {
  const wf = twoStepWorkflow();
  const run = startRun(wf.workflowId);
  expect(run.status).toBe('active');

  const advanced = advanceStep(run.id);

  expect(advanced.currentIndex).toBe(1);
  expect(advanced.steps[0].status).toBe('done');
  expect(advanced.steps[1].status).toBe('current');
});

test('steps follow the taskGraph next chain from the root task, not array order', () => {
  const wf = createWorkflow({
    tasks: [
      { id: 'last', next: [] },
      { id: 'first', next: ['middle'] },
      { id: 'middle', next: ['last'] },
    ],
  });
  const run = startRun(wf.workflowId);

  expect(run.steps.map((s) => s.id)).toEqual(['first', 'middle', 'last']);
  expect(run.steps.map((s) => s.name)).toEqual(['first', 'middle', 'last']);
});

test('AC2: completing a step appends a stage-transition entry to the linked hire auditLog', async () => {
  const hire = await createHire(hireData);
  const wf = twoStepWorkflow();
  const run = startRun(wf.workflowId, hire.id);

  advanceStep(run.id);

  const reloaded = getHire(hire.id);
  expect(reloaded.auditLog.some((e) => e.action.includes('Step One') && e.action.includes('advanced to'))).toBe(true);
  expect(run.auditLog.some((e) => e.action.includes('Step One') && e.action.includes('advanced to'))).toBe(true);
});

test('AC3: attempting a step with an unmet requirement transitions the run to blocked', () => {
  const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Verify I-9', next: [], requirement: { label: 'I-9 document', blockReason: 'I-9 document missing' } }] });
  const run = startRun(wf.workflowId);

  const blocked = advanceStep(run.id);

  expect(blocked.status).toBe('blocked');
  expect(blocked.steps[0].status).toBe('blocked');
});

test('AC5: a blocked attempt does not advance currentIndex or touch later steps', () => {
  const wf = twoStepWorkflow({ requirement: blockingRequirement });
  const run = startRun(wf.workflowId);

  const blocked = advanceStep(run.id);

  expect(blocked.currentIndex).toBe(0);
  expect(blocked.steps[1].status).toBe('upcoming');
});

test('AC6 + AC7: resolving the requirement then retrying resumes from the blocked step and returns to active', () => {
  const wf = twoStepWorkflow({ requirement: blockingRequirement });
  const run = startRun(wf.workflowId);
  advanceStep(run.id);

  const resolved = resolveStepRequirement(run.id);
  expect(resolved.status).toBe('blocked');

  const resumed = advanceStep(run.id);

  expect(resumed.status).toBe('active');
  expect(resumed.currentIndex).toBe(1);
  expect(resumed.steps[0].status).toBe('done');
  expect(resumed.auditLog.some((e) => e.action.includes('after blocking condition resolved'))).toBe(true);
});

test('retrying without resolving the requirement keeps the run blocked', () => {
  const wf = twoStepWorkflow({ requirement: blockingRequirement });
  const run = startRun(wf.workflowId);
  advanceStep(run.id);

  const again = advanceStep(run.id);

  expect(again.status).toBe('blocked');
  expect(again.currentIndex).toBe(0);
});

test('AC9: completing the final step transitions the run to completed', () => {
  const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
  const run = startRun(wf.workflowId);

  const completed = advanceStep(run.id);

  expect(completed.status).toBe('completed');
  expect(completed.steps[0].status).toBe('done');
});

test('advancing a completed run is a no-op', () => {
  const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
  const run = startRun(wf.workflowId);
  advanceStep(run.id);
  const logLength = getRun(run.id).auditLog.length;

  const again = advanceStep(run.id);

  expect(again.status).toBe('completed');
  expect(again.auditLog).toHaveLength(logLength);
});

test('AC10: completing the final step updates the linked hire onboardingStatus to completed, only on the last step', async () => {
  const hire = await createHire(hireData);
  const wf = twoStepWorkflow();
  const run = startRun(wf.workflowId, hire.id);
  expect(getHire(hire.id).onboardingStatus).toBe('in_progress');

  advanceStep(run.id);
  expect(getHire(hire.id).onboardingStatus).toBe('in_progress');

  advanceStep(run.id);
  expect(getHire(hire.id).onboardingStatus).toBe('completed');
});

test('AC12: advancing or resolving a run id that does not exist returns undefined', () => {
  expect(advanceStep('does-not-exist')).toBeUndefined();
  expect(resolveStepRequirement('does-not-exist')).toBeUndefined();
});

test('listRuns returns every stored run', () => {
  const wf = twoStepWorkflow();
  const run = startRun(wf.workflowId);

  expect(listRuns().some((r) => r.id === run.id)).toBe(true);
});

describe('HTTP', () => {
  test('POST /workflows/:id/runs passes hireId through to the run', async () => {
    const hire = await createHire(hireData);
    const wf = twoStepWorkflow();

    const res = await request(app).post(`/workflows/${wf.workflowId}/runs`).set('x-staff-role', 'manager').send({ hireId: hire.id });

    expect(res.status).toBe(201);
    expect(res.body.hireId).toBe(hire.id);
  });

  test('AC8: viewing an in-progress run exposes current step, completed steps, overall status, and the hire', async () => {
    const hire = await createHire(hireData);
    const wf = createWorkflow({
      tasks: [
        { id: 't1', next: ['t2'] },
        { id: 't2', next: ['t3'] },
        { id: 't3', next: [] },
      ],
    });
    const run = startRun(wf.workflowId, hire.id);
    advanceStep(run.id);

    const res = await request(app).get(`/runs/${run.id}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.currentIndex).toBe(1);
    expect(res.body.steps.map((s) => s.status)).toEqual(['done', 'current', 'upcoming']);
    expect(res.body.hire).toMatchObject({ id: hire.id, name: 'A', role: 'AE', department: 'Sales', onboardingStatus: 'in_progress' });
  });

  test('AC4: a blocked run is visible to a manager viewing it', async () => {
    const wf = twoStepWorkflow({ requirement: blockingRequirement });
    const run = startRun(wf.workflowId);

    const advanceRes = await request(app).post(`/runs/${run.id}/advance`).set('x-staff-role', 'manager').send({});
    expect(advanceRes.status).toBe(200);
    const res = await request(app).get(`/runs/${run.id}`);

    expect(res.body.status).toBe('blocked');
    expect(res.body.steps[0].status).toBe('blocked');
    expect(res.body.hire).toBeNull();
  });

  test('POST resolve-requirement then advance resumes a blocked run', async () => {
    const wf = twoStepWorkflow({ requirement: blockingRequirement });
    const run = startRun(wf.workflowId);
    await request(app).post(`/runs/${run.id}/advance`).set('x-staff-role', 'manager').send({});

    const resolveRes = await request(app).post(`/runs/${run.id}/resolve-requirement`).set('x-staff-role', 'hr').send({});
    expect(resolveRes.body.steps[0].requirementMet).toBe(true);
    const retryRes = await request(app).post(`/runs/${run.id}/advance`).set('x-staff-role', 'manager').send({});

    expect(retryRes.body.status).toBe('active');
    expect(retryRes.body.currentIndex).toBe(1);
  });

  test('advance and resolve-requirement return 404 for an unknown run', async () => {
    expect((await request(app).post('/runs/nope/advance').set('x-staff-role', 'manager').send({})).status).toBe(404);
    expect((await request(app).post('/runs/nope/resolve-requirement').set('x-staff-role', 'manager').send({})).status).toBe(404);
  });

  test('GET /runs lists only hire-linked runs as summaries, including the seeded Jordan Reyes run', async () => {
    const wf = twoStepWorkflow();
    const unlinked = startRun(wf.workflowId);

    const res = await request(app).get('/runs');

    expect(res.status).toBe(200);
    expect(res.body.some((r) => r.id === unlinked.id)).toBe(false);
    const seeded = res.body.find((r) => r.hireId === 'hire_2031');
    expect(seeded).toMatchObject({
      hireName: 'Jordan Reyes',
      role: 'Software Engineer II',
      department: 'Engineering',
      status: 'active',
      currentStepLabel: 'Step 2 of 5 — Verify I-9 employment eligibility',
    });
    expect(seeded.startedAt).toBeTruthy();
  });
});
