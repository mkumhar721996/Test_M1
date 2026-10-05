const request = require('supertest');
const app = require('../src/server');
const tasksStore = require('../src/tasks/store');

test('AC1: PUT /tasks/:id updates the task and returns 200 with the updated Task', async () => {
  const task = tasksStore.seedTask({ name: 'Provision laptop', status: 'pending' });
  const res = await request(app)
    .put(`/tasks/${task.id}`)
    .send({ name: 'Provision laptop - updated', status: 'in_progress' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: task.id, name: 'Provision laptop - updated', status: 'in_progress' });
});

test('AC2: PUT /tasks/:id returns 404 and does not update when the task does not exist', async () => {
  const res = await request(app).put('/tasks/does-not-exist').send({ name: 'x', status: 'done' });
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('task not found');
  expect(tasksStore.getTask('does-not-exist')).toBeUndefined();
});

test('AC3: PUT /tasks/:id accepts any status value without enforcing transition rules', async () => {
  const task = tasksStore.seedTask({ name: 'Send welcome email', status: 'done' });
  const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'pending' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('pending');
  expect(tasksStore.getTask(task.id).status).toBe('pending');
});

test('AC4: PUT /tasks/:id returns 400 with a descriptive error for a malformed request body', async () => {
  const task = tasksStore.seedTask({ name: 'Order badge', status: 'pending' });
  const res = await request(app)
    .put(`/tasks/${task.id}`)
    .set('Content-Type', 'application/json')
    .send('"just-a-string"');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
});

test('AC4: PUT /tasks/:id returns 400 with a descriptive error for syntactically invalid JSON', async () => {
  const task = tasksStore.seedTask({ name: 'Order badge', status: 'pending' });
  const res = await request(app)
    .put(`/tasks/${task.id}`)
    .set('Content-Type', 'application/json')
    .send('{bad');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
});

test('AC4: PUT /tasks/:id returns 400 with a descriptive error for an invalid field type', async () => {
  const task = tasksStore.seedTask({ name: 'Order badge', status: 'pending' });
  const res = await request(app).put(`/tasks/${task.id}`).send({ status: { nested: true } });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
  expect(tasksStore.getTask(task.id).status).toBe('pending');
});

test('AC5: PUT /tasks/:id succeeds without a version/etag field and does not return one', async () => {
  const task = tasksStore.seedTask({ name: 'Set up desk', status: 'pending' });
  const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'in_progress' });
  expect(res.status).toBe(200);
  expect(res.body.version).toBeUndefined();
  expect(res.body.etag).toBeUndefined();
});

test('AC6: two sequential PUT /tasks/:id requests result in the later values with no conflict error', async () => {
  const task = tasksStore.seedTask({ name: 'Grant system access', status: 'pending' });
  const first = await request(app).put(`/tasks/${task.id}`).send({ status: 'in_progress' });
  const second = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(tasksStore.getTask(task.id).status).toBe('done');
});
