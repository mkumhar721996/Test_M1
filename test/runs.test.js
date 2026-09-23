const request = require('supertest');
const app = require('../src/server');
const { getNotificationsForCoordinator, resetNotifications } = require('../src/runs/notifications');

beforeEach(() => {
  resetNotifications();
});

const workflowPayload = {
  name: 'New Hire Onboarding',
  hireAttributeSchema: ['hireType'],
  branches: [
    {
      id: 'remote',
      condition: { attribute: 'hireType', operator: 'equals', value: 'remote-contractor' },
      taskIds: ['ship-equipment', 'remote-it-setup'],
    },
    {
      id: 'onsite',
      condition: { attribute: 'hireType', operator: 'equals', value: 'employee' },
      taskIds: ['badge-provisioning', 'onsite-it-setup'],
    },
  ],
  defaultTaskIds: ['send-welcome-email', 'assign-buddy'],
};

test('AC1: a run for a remote-contractor hire executes the matching branch tasks', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: { hireType: 'remote-contractor' },
    });

  expect(runRes.status).toBe(201);
  expect(runRes.body.taskStatuses['ship-equipment']).toBe('executed');
  expect(runRes.body.taskStatuses['remote-it-setup']).toBe('executed');
  expect(runRes.body.taskStatuses['badge-provisioning']).toBe('skipped');
  expect(runRes.body.taskStatuses['onsite-it-setup']).toBe('skipped');
  expect(runRes.body.taskStatuses['send-welcome-email']).toBe('skipped');
  expect(runRes.body.taskStatuses['assign-buddy']).toBe('skipped');
});

test('AC2: the non-matching branch tasks are recorded as skipped', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: { hireType: 'remote-contractor' },
    });

  expect(runRes.body.taskStatuses['ship-equipment']).toBe('executed');
  expect(runRes.body.taskStatuses['remote-it-setup']).toBe('executed');
  expect(runRes.body.taskStatuses['badge-provisioning']).toBe('skipped');
  expect(runRes.body.taskStatuses['onsite-it-setup']).toBe('skipped');
});

test('AC3: a run for a hire matching no branch executes the default path tasks', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: { hireType: 'intern' },
    });

  expect(runRes.body.taskStatuses['send-welcome-email']).toBe('executed');
  expect(runRes.body.taskStatuses['assign-buddy']).toBe('executed');
});

test('AC4: every defined task is executed or skipped, none omitted', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: { hireType: 'intern' },
    });

  const allTaskIds = [
    'ship-equipment',
    'remote-it-setup',
    'badge-provisioning',
    'onsite-it-setup',
    'send-welcome-email',
    'assign-buddy',
  ];
  allTaskIds.forEach((taskId) => {
    expect(['executed', 'skipped']).toContain(runRes.body.taskStatuses[taskId]);
  });
  expect(Object.keys(runRes.body.taskStatuses)).toHaveLength(allTaskIds.length);
});

test('AC5: a missing schema-referenced attribute blocks the run', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: {},
    });

  expect(runRes.status).toBe(201);
  expect(runRes.body.status).toBe('blocked');
});

test('AC6: the assigned HR coordinator is notified when the run blocks', async () => {
  const wfRes = await request(app).post('/workflows').send(workflowPayload);
  const runRes = await request(app)
    .post('/runs')
    .send({
      workflowId: wfRes.body.id,
      coordinatorId: 'coord-1',
      hireAttributes: {},
    });

  const notifications = getNotificationsForCoordinator('coord-1');
  expect(notifications.some((n) => n.runId === runRes.body.id)).toBe(true);
});
