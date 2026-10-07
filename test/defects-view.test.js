const request = require('supertest');
const app = require('../src/server');
const defectsStore = require('../src/defects/store');
const projectsStore = require('../src/projects/store');

const get = (url, user) => {
  const r = request(app).get(url);
  return user ? r.set('x-user-id', user) : r;
};

function memberProject(name, user) {
  const project = projectsStore.createProject(name);
  projectsStore.addMember(project.id, user);
  return project;
}

test('AC1/AC5: list shows id, title, status for every member-project defect, newest-updated first', async () => {
  const project = memberProject('Checkout Experience', 'dana1');
  const older = defectsStore.createDefect({ title: 'Older bug', projectId: project.id });
  const newer = defectsStore.createDefect({ title: 'Newer bug', projectId: project.id });
  defectsStore.updateDefect(older.id, { status: 'In Progress', updatedAt: '2000-01-01T00:00:00.000Z' });
  defectsStore.updateDefect(newer.id, { status: 'In Progress' });
  const res = await get('/defects', 'dana1');
  expect(res.status).toBe(200);
  expect(res.body.items.filter((d) => d.projectId === project.id).map((d) => d.id)).toEqual([newer.id, older.id]);
  expect(res.body.items[0]).toMatchObject({ id: newer.id, title: 'Newer bug', status: 'In Progress' });
});

test('AC2: detail view returns every logged field plus current status', async () => {
  const project = memberProject('Search & Discovery', 'dana2');
  const defect = defectsStore.createDefect({
    title: 'Bug', description: 'Desc', steps: 'Steps', environment: 'Env',
    severity: 'High', reportedBy: 'Priya Nair', projectId: project.id,
  });
  const res = await get(`/defects/${defect.id}`, 'dana2');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    id: defect.id, title: 'Bug', description: 'Desc', steps: 'Steps',
    environment: 'Env', severity: 'High', status: 'New', projectName: 'Search & Discovery',
  });
  expect(res.body.updatedAt).toBeTruthy();
});

test('AC3: a change made after the view was first loaded is served on the very next read', async () => {
  const project = memberProject('Checkout Experience', 'dana3');
  const defect = defectsStore.createDefect({ title: 'Bug', projectId: project.id });
  await get(`/defects/${defect.id}`, 'dana3');
  defectsStore.updateDefect(defect.id, { status: 'Closed' });
  const res = await get(`/defects/${defect.id}`, 'dana3');
  expect(res.body.status).toBe('Closed');
  const list = await get('/defects', 'dana3');
  expect(list.body.items[0].status).toBe('Closed');
});

test('AC4: no x-user-id header returns 401 and leaks no defect data', async () => {
  const project = memberProject('Checkout Experience', 'dana4');
  const defect = defectsStore.createDefect({ title: 'Secret bug', projectId: project.id });
  const listRes = await get('/defects');
  expect(listRes.status).toBe(401);
  expect(listRes.body).toEqual({ error: 'unauthorized' });
  const detailRes = await get(`/defects/${defect.id}`);
  expect(detailRes.status).toBe(401);
  expect(JSON.stringify(detailRes.body)).not.toContain('Secret bug');
});

test('AC6: pagination splits results across pages of 5', async () => {
  const project = memberProject('Checkout Experience', 'dana6');
  for (let i = 0; i < 7; i += 1) defectsStore.createDefect({ title: `Bug ${i}`, projectId: project.id });
  const all = (await get('/defects?page=1', 'dana6')).body;
  expect(all.items).toHaveLength(5);
  expect(all.pageSize).toBe(5);
  expect(all.page).toBe(1);
  expect(all.totalPages).toBe(Math.ceil(all.totalItems / 5));
  const last = await get(`/defects?page=${all.totalPages}`, 'dana6');
  expect(last.body.items.length).toBeGreaterThan(0);
  expect(last.body.page).toBe(all.totalPages);
});

test('AC7: a member of a project with no defects gets an empty items array', async () => {
  // Isolated module registry so no defects from other tests (including unassigned ones) exist.
  let isolatedApp;
  let projects;
  jest.isolateModules(() => {
    isolatedApp = require('../src/server');
    projects = require('../src/projects/store');
  });
  const p = projects.createProject('Empty Project');
  projects.addMember(p.id, 'casey');
  const res = await request(isolatedApp).get('/defects').set('x-user-id', 'casey');
  expect(res.body).toEqual({ items: [], page: 1, pageSize: 5, totalItems: 0, totalPages: 1 });
});

test('AC8: an id that does not correspond to any defect returns 404', async () => {
  const res = await get('/defects/DEF-does-not-exist', 'dana8');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'defect not found' });
});

test('AC9: a non-member-project defect is excluded from the list and indistinguishable from not-found in detail', async () => {
  const mine = memberProject('Checkout Experience', 'dana9');
  const other = projectsStore.createProject('Mobile App');
  const hidden = defectsStore.createDefect({ title: 'Mobile-only bug', projectId: other.id });
  const visible = defectsStore.createDefect({ title: 'Mine', projectId: mine.id });
  const listRes = await get('/defects', 'dana9');
  expect(listRes.body.items.find((d) => d.id === hidden.id)).toBeUndefined();
  expect(listRes.body.items.find((d) => d.id === visible.id)).toBeDefined();
  const detailRes = await get(`/defects/${hidden.id}`, 'dana9');
  const missing = await get('/defects/DEF-does-not-exist', 'dana9');
  expect(detailRes.status).toBe(404);
  expect(detailRes.body).toEqual({ error: 'defect not found' });
  expect(detailRes.text).toBe(missing.text);
});

test('POST /defects without x-user-id is rejected with 401 and creates nothing', async () => {
  const before = defectsStore.listDefects().length;
  const res = await request(app).post('/defects').send({ title: 'Anon bug' });
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'unauthorized' });
  expect(defectsStore.listDefects().length).toBe(before);
});

test('POST /defects with a projectId the caller is not a member of is rejected', async () => {
  const other = projectsStore.createProject('Mobile App');
  const before = defectsStore.listDefects().length;
  const res = await request(app).post('/defects').set('x-user-id', 'outsider').send({ title: 'Injected', projectId: other.id });
  expect(res.status).toBe(403);
  expect(defectsStore.listDefects().length).toBe(before);
});

test('POST /defects with a projectId the caller belongs to is accepted', async () => {
  const mine = memberProject('Checkout Experience', 'member-poster');
  const res = await request(app).post('/defects').set('x-user-id', 'member-poster').send({ title: 'Mine', projectId: mine.id });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ projectId: mine.id, projectName: 'Checkout Experience' });
});
