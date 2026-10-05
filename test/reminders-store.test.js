const { createWorkflow } = require('../src/workflows/store');
const { startRun, advanceStep } = require('../src/runs/store');
const channels = require('../src/reminders/channels');
const { evaluateRun, getDeliveryLog } = require('../src/reminders/store');

function singleStepRun(extra = {}) {
  const wf = createWorkflow({
    tasks: [{
      id: 't1', owner: 'IT — Devon Ruiz', hrContact: 'HR — Priya Shah', managerContact: 'Manager — Morgan Ellis', deadlineOffsetHours: 48, reminderWindowHours: 48, next: [], ...extra,
    }],
  });
  return startRun(wf.workflowId);
}

afterEach(() => jest.restoreAllMocks());

describe('deadline reminders store', () => {
  test('AC1: window reached sends to owner, HR and manager on both channels', () => {
    const run = singleStepRun();
    evaluateRun(run, new Date(run.startedAt));
    const log = getDeliveryLog(run.id);
    expect(log).toHaveLength(6);
    expect(log.map((e) => `${e.recipientRole}:${e.channel}`).sort()).toEqual(
      ['hr:email', 'hr:in-app', 'manager:email', 'manager:in-app', 'owner:email', 'owner:in-app'],
    );
    expect(log.every((e) => e.outcome === 'delivered')).toBe(true);
  });

  test('AC1: nothing is sent before the window opens', () => {
    const run = singleStepRun({ reminderWindowHours: 10 });
    evaluateRun(run, new Date(run.startedAt));
    expect(getDeliveryLog(run.id)).toHaveLength(0);
  });

  test('AC1: no reminder fires once the owner has acted', () => {
    const run = singleStepRun();
    advanceStep(run.id);
    evaluateRun(run, new Date(run.startedAt));
    expect(getDeliveryLog(run.id)).toHaveLength(0);
  });

  test('AC2: 6 elapsed intervals send exactly 5 reminders', () => {
    const run = singleStepRun();
    const start = new Date(run.startedAt).getTime();
    for (let i = 0; i < 6; i += 1) evaluateRun(run, new Date(start + i * 12 * 3600 * 1000));
    expect(run.steps[0].remindersSent).toBe(5);
    expect(getDeliveryLog(run.id)).toHaveLength(30);
  });

  test('AC3: a failed channel is logged distinctly with recipient and channel', () => {
    jest.spyOn(channels, 'sendEmail').mockImplementationOnce(() => { throw new Error('Mailbox unavailable'); });
    const run = singleStepRun();
    evaluateRun(run, new Date(run.startedAt));
    const log = getDeliveryLog(run.id);
    expect(log.find((e) => e.recipientRole === 'owner' && e.channel === 'email')).toMatchObject({
      outcome: 'failed', reason: 'Mailbox unavailable', recipientLabel: 'IT — Devon Ruiz',
    });
    expect(log.find((e) => e.recipientRole === 'owner' && e.channel === 'in-app').outcome).toBe('delivered');
  });
});
