const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun } = require('../src/runs/store');

function dueRun() {
  const wf = createWorkflow({ tasks: [{ id: 't1', owner: 'IT — Devon Ruiz', deadlineOffsetHours: 48, reminderWindowHours: 48, next: [] }] });
  return startRun(wf.workflowId);
}

describe('reminder routes', () => {
  test('AC1+AC3: check endpoint sends and reports recipients/channels', async () => {
    const run = dueRun();
    const res = await request(app).post(`/runs/${run.id}/reminders/check`).set('x-staff-role', 'manager').send({});
    expect(res.status).toBe(200);
    expect(res.body.remindersSent).toBe(1);
    expect(res.body.deliveryLog).toHaveLength(6);
  });

  test('check requires an onboarding role and 404s for unknown runs', async () => {
    const run = dueRun();
    const denied = await request(app).post(`/runs/${run.id}/reminders/check`).send({});
    expect(denied.status).not.toBe(200);
    expect((await request(app).get('/runs/nope/reminders')).status).toBe(404);
  });

  test('AC2: once capped, further checks send nothing', async () => {
    const run = dueRun();
    run.steps[0].remindersSent = 5;
    const get = () => request(app).get(`/runs/${run.id}/reminders`);
    expect((await get()).body.capped).toBe(true);
    const before = (await get()).body.remindersSent;
    await request(app).post(`/runs/${run.id}/reminders/check`).set('x-staff-role', 'manager').send({});
    expect((await get()).body.remindersSent).toBe(before);
  });
});
