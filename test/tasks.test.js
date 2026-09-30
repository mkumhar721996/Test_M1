const request = require('supertest');
const app = require('../src/server');
const { createTask } = require('../src/tasks/store');

test('AC1: GET /tasks with no query params returns all Task records with 200', async () => {
  createTask({ runId: 'run-ac1-a', name: 'Send welcome email' });
  createTask({ runId: 'run-ac1-b', name: 'Charge deposit' });
  const res = await request(app).get('/tasks');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ runId: 'run-ac1-a' }),
      expect.objectContaining({ runId: 'run-ac1-b' }),
    ])
  );
});

test('AC2: GET /tasks?runId= filters to only matching Task records with 200', async () => {
  const match = createTask({ runId: 'run-ac2-match', name: 'Book room' });
  createTask({ runId: 'run-ac2-other', name: 'Unrelated task' });
  const res = await request(app).get('/tasks').query({ runId: 'run-ac2-match' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual([expect.objectContaining({ id: match.id, runId: 'run-ac2-match' })]);
});

test('AC3: GET /tasks?runId= with no matches returns an empty list with 200', async () => {
  const res = await request(app).get('/tasks').query({ runId: 'run-does-not-exist' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('AC4: GET /tasks/:id returns the matching Task record with 200', async () => {
  const task = createTask({ runId: 'run-ac4', name: 'Verify identity' });
  const res = await request(app).get(`/tasks/${task.id}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual(task);
});

test('AC5: GET /tasks/:id with a non-existent id returns 404', async () => {
  const res = await request(app).get('/tasks/00000000-0000-0000-0000-000000000000');
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('task not found');
});
