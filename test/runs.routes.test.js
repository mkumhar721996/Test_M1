const request = require('supertest');
const app = require('../src/server');
const notificationsModule = require('../src/runs/notifications');

function newRunPayload(name) {
  return {
    name,
    tasks: [{ name: 'Provision laptop asset', hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } }],
  };
}

async function createRun(name) {
  const res = await request(app).post('/runs').send(newRunPayload(name));
  return { runId: res.body.id, taskId: res.body.tasks[0].id };
}

test('AC1/AC2: task state is retrying with exponential backoff after attempt 1 and attempt 2', async () => {
  const { runId, taskId } = await createRun('Onboarding: Jamie Fox');

  const res1 = await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  const task1 = res1.body.tasks.find((t) => t.id === taskId);
  expect(task1.state).toBe('retrying');
  expect(new Date(task1.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(29000);

  const res2 = await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  const task2 = res2.body.tasks.find((t) => t.id === taskId);
  expect(task2.state).toBe('retrying');
  expect(new Date(task2.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(119000);
  expect(res2.body.state).toBe('in-progress');
});

test('AC3/AC4: the third failure blocks task and Run, and notifies the HR coordinator in-app and by email', async () => {
  const { runId, taskId } = await createRun('Onboarding: Jamie Fox');
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  const res = await request(app)
    .post(`/runs/${runId}/tasks/${taskId}/failures`)
    .send({ reason: 'Vendor API timeout (504)' });

  const task = res.body.tasks.find((t) => t.id === taskId);
  expect(task.state).toBe('blocked');
  expect(res.body.state).toBe('blocked');
  expect(res.body.notifications.some((n) => n.text.includes('Provision laptop asset'))).toBe(true);
  expect(notificationsModule.listSentEmails().some((e) => e.to === 'priya.nair@northlake-hr.example')).toBe(true);
});

test('AC5: resolving a blocked task via the API resumes the Run', async () => {
  const { runId, taskId } = await createRun('Onboarding: Jamie Fox');
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });

  const res = await request(app)
    .post(`/runs/${runId}/tasks/${taskId}/resolution`)
    .send({ resolver: 'Priya Nair — HR Coordinator', note: 'Fixed manually' });

  expect(res.status).toBe(200);
  const task = res.body.tasks.find((t) => t.id === taskId);
  expect(task.state).toBe('in-progress');
  expect(res.body.state).toBe('in-progress');
});

test('AC5: resolving a task that is not blocked returns a 409 conflict', async () => {
  const { runId, taskId } = await createRun('Onboarding: Jamie Fox');
  const res = await request(app)
    .post(`/runs/${runId}/tasks/${taskId}/resolution`)
    .send({ resolver: 'x', note: 'y' });
  expect(res.status).toBe(409);
});

test('AC6: GET /audit-log records attempt, reason, and timestamp for a retry event', async () => {
  const { runId, taskId } = await createRun('Onboarding: Jamie Fox');
  await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'Vendor API timeout (504)' });

  const res = await request(app).get('/audit-log');
  expect(res.status).toBe(200);
  const entry = res.body.find((e) => e.runId === runId);
  expect(entry.attempt).toBe(1);
  expect(entry.reason).toBe('Vendor API timeout (504)');
  expect(entry.timestamp).toBeDefined();
});

test('GET /runs/:runId 404s for an unknown run', async () => {
  const res = await request(app).get('/runs/does-not-exist');
  expect(res.status).toBe(404);
});

test('the seeded demo run RUN-4821 is available on first load', async () => {
  const res = await request(app).get('/runs/RUN-4821');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Onboarding: Jordan Lee');
  expect(res.body.tasks).toHaveLength(3);
});
