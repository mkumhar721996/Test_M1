const request = require('supertest');
const app = require('../src/server');
const { createRun } = require('../src/runs/store');

test('pause is rejected with a 403 permission error for a non-coordinator, non-admin actor', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const res = await request(app)
    .post(`/runs/${run.id}/pause`)
    .send({ actorId: 'someone_else', actorRole: 'employee' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not authorized/i);
});

test('resume is rejected with a 403 permission error for a non-coordinator, non-admin actor', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'paused', tasks: [] });
  const res = await request(app)
    .post(`/runs/${run.id}/resume`)
    .send({ actorId: 'someone_else', actorRole: 'employee' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not authorized/i);
});

test('cancel is rejected with a 403 permission error for a non-coordinator, non-admin actor', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const res = await request(app)
    .post(`/runs/${run.id}/cancel`)
    .send({ actorId: 'someone_else', actorRole: 'employee' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not authorized/i);
});

test('a successful pause by the assigned coordinator returns 200 with the updated state', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const res = await request(app)
    .post(`/runs/${run.id}/pause`)
    .send({ actorId: 'coord_1', actorRole: 'hr_coordinator' });
  expect(res.status).toBe(200);
  expect(res.body.state).toBe('paused');
});

test('GET /runs/:id returns the current run state', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const res = await request(app).get(`/runs/${run.id}`);
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(run.id);
});

test('a request missing actorId and actorRole is rejected as unauthorized, not a server error', async () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const res = await request(app).post(`/runs/${run.id}/pause`).send({});
  expect(res.status).toBe(403);
});

test('pausing a nonexistent run returns 404', async () => {
  const res = await request(app)
    .post('/runs/does-not-exist/pause')
    .send({ actorId: 'coord_1', actorRole: 'hr_coordinator' });
  expect(res.status).toBe(404);
});

test('resuming a nonexistent run returns 404', async () => {
  const res = await request(app)
    .post('/runs/does-not-exist/resume')
    .send({ actorId: 'coord_1', actorRole: 'hr_coordinator' });
  expect(res.status).toBe(404);
});

test('cancelling a nonexistent run returns 404', async () => {
  const res = await request(app)
    .post('/runs/does-not-exist/cancel')
    .send({ actorId: 'coord_1', actorRole: 'hr_coordinator' });
  expect(res.status).toBe(404);
});

test('GET on a nonexistent run returns 404', async () => {
  const res = await request(app).get('/runs/does-not-exist');
  expect(res.status).toBe(404);
});
