const request = require('supertest');
const app = require('../src/server');
const projectsStore = require('../src/projects/store');
const runsStore = require('../src/runs/store');

const validTaskGraph = { tasks: [{ id: 't1', next: [] }] };

function memberProject(name, user) {
  const project = projectsStore.createProject(name);
  projectsStore.addMember(project.id, user);
  return project;
}

function save(user, projectId) {
  return request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').set('x-user-id', user).send({ taskGraph: validTaskGraph, projectId });
}

test('AC9: a workflow created within a project is retrievable by a member of that project', async () => {
  const project = memberProject('Onboarding Pilot', 'alex1');
  const created = await save('alex1', project.id);
  expect(created.status).toBe(201);
  const res = await request(app).get(`/workflows/${created.body.id}`).set('x-user-id', 'alex1');
  expect(res.status).toBe(200);
  expect(res.body.projectId).toBe(project.id);
  const v = await request(app).get(`/workflows/${created.body.id}/versions/1`).set('x-user-id', 'alex1');
  expect(v.status).toBe(200);
});

test('AC10: a workflow is not visible to a user of another project', async () => {
  const mine = memberProject('Onboarding Pilot', 'alex2');
  memberProject('Other Team', 'jordan2');
  const created = await save('alex2', mine.id);
  const res = await request(app).get(`/workflows/${created.body.id}`).set('x-user-id', 'jordan2');
  expect(res.status).toBe(404);
  const v = await request(app).get(`/workflows/${created.body.id}/versions/1`).set('x-user-id', 'jordan2');
  expect(v.status).toBe(404);
});

test('AC9: a non-member cannot create a workflow in a project', async () => {
  const project = memberProject('Onboarding Pilot', 'alex3');
  const res = await save('jordan3', project.id);
  expect(res.status).toBe(403);
});

test('retrieval requires an authenticated user', async () => {
  const res = await request(app).get('/workflows/anything');
  expect(res.status).toBe(401);
});

test('AC10: a non-member cannot start a Run against a project workflow', async () => {
  const mine = memberProject('Onboarding Pilot', 'alex5');
  memberProject('Other Team', 'jordan5');
  const created = await save('alex5', mine.id);
  const run = (user) => request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'hr_coordinator').set('x-user-id', user).send({});
  const denied = await run('jordan5');
  expect(denied.status).toBe(404);
  const anon = await request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'hr_coordinator').send({});
  expect(anon.status).toBe(404);
  expect(runsStore.listRuns().filter((r) => r.workflowId === created.body.id)).toHaveLength(0);
  expect((await run('alex5')).status).toBe(201);
});

test('AC10: a non-member cannot save a version of a project workflow', async () => {
  const mine = memberProject('Onboarding Pilot', 'alex6');
  memberProject('Other Team', 'jordan6');
  const created = await save('alex6', mine.id);
  const post = (user) => request(app).post(`/workflows/${created.body.id}/versions`).set('x-staff-role', 'hr_coordinator').set('x-user-id', user).send({ taskGraph: { tasks: [{ id: 'evil', next: [] }] } });
  expect((await post('jordan6')).status).toBe(404);
  const latest = await request(app).get(`/workflows/${created.body.id}`).set('x-user-id', 'alex6');
  expect(latest.body.version).toBe(1);
  expect((await post('alex6')).status).toBe(201);
});
