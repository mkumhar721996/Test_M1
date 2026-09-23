const inAppAlerts = [];
const sentEmails = [];

function notifyHrCoordinator({ coordinator, run, task, reason, timestamp }) {
  const text = `Task blocked: "${task.name}" on ${run.id} (${run.name}) failed ${task.attempts} times and needs your review.`;
  const alert = {
    id: `${run.id}:${task.id}:${timestamp}`,
    runId: run.id,
    taskId: task.id,
    coordinatorEmail: coordinator.email,
    text,
    time: timestamp,
  };
  inAppAlerts.push(alert);

  const email = {
    to: coordinator.email,
    from: 'no-reply@workforce-ops.example',
    subject: `Action needed: Task blocked on ${run.id} (${run.name})`,
    body: `The task "${task.name}" on Run ${run.id} has failed ${task.attempts} times. Last failure: ${reason}.`,
    time: timestamp,
  };
  sentEmails.push(email);

  return { alert, email };
}

function listAlertsFor(runId) {
  return inAppAlerts.filter((a) => a.runId === runId);
}

function listSentEmails() {
  return [...sentEmails];
}

module.exports = { notifyHrCoordinator, listAlertsFor, listSentEmails };
