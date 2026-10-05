const request = require('supertest');
const app = require('../src/server');
const tasksStore = require('../src/tasks/store');

beforeEach(() => {
  tasksStore.clearTasks();
});

test('GET /tasks returns all Task records', async () => {
  const t1 = tasksStore.createTask({ runId: 'run_aaa', name: 'Step 1' });
  const t2 = tasksStore.createTask({ runId: 'run_bbb', name: 'Step 2' });
  const res = await request(app).get('/tasks');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: t1.id }),
      expect.objectContaining({ id: t2.id }),
    ])
  );
});

test('GET /tasks?runId= returns only matching Task records', async () => {
  const runId = `run_${Date.now()}`;
  const match = tasksStore.createTask({ runId, name: 'Matching task' });
  tasksStore.createTask({ runId: 'run_other', name: 'Other task' });
  const res = await request(app).get('/tasks').query({ runId });
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0]).toMatchObject({ id: match.id, runId });
});

test('GET /tasks?runId= with no matches returns an empty list', async () => {
  const res = await request(app).get('/tasks').query({ runId: 'run_does_not_exist' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('GET /tasks/:id returns the matching Task record', async () => {
  const task = tasksStore.createTask({ runId: 'run_ccc', name: 'Lookup task' });
  const res = await request(app).get(`/tasks/${task.id}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual(task);
});

test('GET /tasks/:id with unknown id returns 404', async () => {
  const res = await request(app).get('/tasks/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'task not found' });
});
