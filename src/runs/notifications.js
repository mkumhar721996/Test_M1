const inAppAlerts = [];
const emailQueue = [];

function notifyCoordinatorPaused(run) {
  const sentAt = new Date().toISOString();
  inAppAlerts.push({ recipientId: run.assignedCoordinatorId, type: 'run_paused', runId: run.id, sentAt });
  emailQueue.push({ to: run.assignedCoordinatorId, subject: `Run ${run.id} paused`, runId: run.id, sentAt });
}

function getInAppAlertsFor(recipientId) {
  return inAppAlerts.filter((a) => a.recipientId === recipientId);
}

function getEmailQueueFor(recipientId) {
  return emailQueue.filter((e) => e.to === recipientId);
}

function resetNotifications() {
  inAppAlerts.length = 0;
  emailQueue.length = 0;
}

module.exports = { notifyCoordinatorPaused, getInAppAlertsFor, getEmailQueueFor, resetNotifications };
