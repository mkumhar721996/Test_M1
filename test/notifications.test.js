const notifications = require('../src/runs/notifications');

test('notifyHrCoordinator records an in-app alert for the run', () => {
  const run = { id: 'RUN-TEST-4', name: 'Onboarding: Test' };
  const task = { id: 'TASK-1', name: 'Provision laptop asset', attempts: 3, hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } };
  notifications.notifyHrCoordinator({ coordinator: task.hrCoordinator, run, task, reason: 'x', timestamp: '2026-09-23T09:07:41.000Z' });
  const alerts = notifications.listAlertsFor('RUN-TEST-4');
  expect(alerts).toHaveLength(1);
  expect(alerts[0].text).toContain('Provision laptop asset');
});

test('notifyHrCoordinator sends a paired email to the coordinator', () => {
  const run = { id: 'RUN-TEST-5', name: 'Onboarding: Test' };
  const task = { id: 'TASK-1', name: 'Provision laptop asset', attempts: 3, hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } };
  notifications.notifyHrCoordinator({ coordinator: task.hrCoordinator, run, task, reason: 'Vendor API timeout (504)', timestamp: '2026-09-23T09:07:41.000Z' });
  const sent = notifications.listSentEmails();
  expect(sent.some((e) => e.to === 'priya.nair@northlake-hr.example' && e.body.includes('Vendor API timeout (504)'))).toBe(true);
});
