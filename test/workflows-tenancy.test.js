const request = require('supertest');
const app = require('../src/server');
const projectsStore = require('../src/projects/store');

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
