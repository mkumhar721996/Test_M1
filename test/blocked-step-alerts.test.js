const request = require('supertest');
const app = require('../src/server');
const { createWorkflow } = require('../src/workflows/store');
const { startRun, advanceStep } = require('../src/runs/store');
const { listDeliveryLog } = require('../src/notifications/store');

function blockedWorkflow() {
  return createWorkflow({
    notifyRecipients: {
      hr: { name: 'Priya Shah', email: 'priya.shah@onboardco.example' },
      managers: [{ name: 'Morgan Ellis', email: 'morgan.ellis@onboardco.example' }],
    },
    tasks: [{
      id: 't1', name: 'Verify I-9', next: [],
      ownerName: 'Devon Ruiz', ownerTitle: 'IT Systems', ownerEmail: 'devon.ruiz@onboardco.example',
      requirement: { label: 'I-9 doc', blockReason: 'missing' },
    }],
  });
}

describe('blocked step alerts', () => {
  test('AC1: notifies HR, managers and step owner on both channels', () => {
    const run = startRun(blockedWorkflow().workflowId);
    advanceStep(run.id);
    const log = listDeliveryLog({ runId: run.id });
    expect(log).toHaveLength(6);
    expect(new Set(log.map((e) => e.recipientName))).toEqual(new Set(['Priya Shah', 'Morgan Ellis', 'Devon Ruiz']));
    expect(log.every((e) => e.status === 'delivered')).toBe(true);
  });

  test('AC1: delivery log readable over HTTP', async () => {
    const run = startRun(blockedWorkflow().workflowId);
    advanceStep(run.id);
    const res = await request(app).get(`/notifications/delivery-log?runId=${run.id}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(6);
    const failedRes = await request(app).get(`/notifications/delivery-log?runId=${run.id}&status=failed`);
    expect(failedRes.body).toHaveLength(0);
  });

  test('AC2: only the blocked step owner is notified', () => {
    const wf = createWorkflow({
      notifyRecipients: { hr: null, managers: [] },
      tasks: [
        { id: 't1', name: 'Step 1', next: ['t2'], ownerName: 'Devon Ruiz', ownerEmail: 'devon@x.com', requirement: { label: 'req', blockReason: 'missing' } },
        { id: 't2', name: 'Step 2', next: [], ownerName: 'Riley Chen', ownerEmail: 'riley@x.com' },
      ],
    });
    const run = startRun(wf.workflowId);
    advanceStep(run.id);
    const names = new Set(listDeliveryLog({ runId: run.id }).map((e) => e.recipientName));
    expect(names.has('Devon Ruiz')).toBe(true);
    expect(names.has('Riley Chen')).toBe(false);
  });

  test('AC2: dedups owner who is also HR', () => {
    const wf = createWorkflow({
      notifyRecipients: { hr: { name: 'Priya Shah', email: 'priya.shah@x.com' }, managers: [] },
      tasks: [{
        id: 't1', name: 'I-9', next: [],
        ownerName: 'Priya Shah', ownerTitle: 'HR Partner', ownerEmail: 'priya.shah@x.com',
        requirement: { label: 'doc', blockReason: 'missing' },
      }],
    });
    const run = startRun(wf.workflowId);
    advanceStep(run.id);
    const log = listDeliveryLog({ runId: run.id });
    expect(log.filter((e) => e.recipientName === 'Priya Shah' && e.channel === 'Email')).toHaveLength(1);
    expect(log[0].recipientRole).toBe('HR & Step owner — HR Partner');
  });

  test('AC3: missing address fails but is logged with diagnosable detail', () => {
    const wf = createWorkflow({
      notifyRecipients: { hr: null, managers: [] },
      tasks: [{ id: 't1', name: 'Step', next: [], ownerName: 'Devon Ruiz', ownerEmail: '', requirement: { label: 'req', blockReason: 'missing' } }],
    });
    const run = startRun(wf.workflowId);
    advanceStep(run.id);
    const log = listDeliveryLog({ runId: run.id });
    const failed = log.find((e) => e.channel === 'Email');
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('NO_EMAIL_ADDRESS');
    expect(failed.detail).toContain('Devon Ruiz');
    expect(failed.notificationId).toBeTruthy();
    expect(failed.stepId).toBe('t1');
    expect(log.find((e) => e.channel === 'In-app').status).toBe('delivered');
    expect(listDeliveryLog({ runId: run.id, status: 'failed' })).toHaveLength(1);
  });

  test('retrying an already-blocked step does not re-fire', () => {
    const run = startRun(blockedWorkflow().workflowId);
    advanceStep(run.id);
    const firstCount = listDeliveryLog({ runId: run.id }).length;
    advanceStep(run.id);
    expect(listDeliveryLog({ runId: run.id })).toHaveLength(firstCount);
  });
});
