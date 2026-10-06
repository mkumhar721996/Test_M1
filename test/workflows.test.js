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

describe('workflow names and listing', () => {
  const request = require('supertest');
  const app = require('../src/server');

  test('createWorkflow stores and returns an optional name', () => {
    const wf = createWorkflow({ tasks: [{ id: 't1', next: [] }] }, 'Engineering Onboarding');
    expect(wf.name).toBe('Engineering Onboarding');
  });

  test('GET /workflows lists each workflow with its ordered step preview', async () => {
    const created = await request(app).post('/workflows').send({
      name: 'Sales Onboarding',
      taskGraph: { tasks: [{ id: 't1', name: 'Offer letter', owner: 'HR', next: ['t2'] }, { id: 't2', name: 'Background check', owner: 'HR', requirement: { label: 'Check cleared' }, next: [] }] },
    });
    const res = await request(app).get('/workflows').set('x-staff-role', 'hr');
    expect(res.status).toBe(200);
    const wf = res.body.find((w) => w.id === created.body.id);
    expect(wf).toMatchObject({ name: 'Sales Onboarding', steps: [{ name: 'Offer letter', owner: 'HR' }, { name: 'Background check', owner: 'HR', requirementLabel: 'Check cleared' }] });
  });

  test('GET /workflows without a role header is 401', async () => {
    expect((await request(app).get('/workflows')).status).toBe(401);
  });
});
