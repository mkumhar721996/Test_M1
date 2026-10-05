const channels = require('./channels');
const { getActiveRuns } = require('../runs/store');

const MAX_REMINDERS = 5;
const DEFAULT_REMINDER_WINDOW_HOURS = 48;
// Placeholder cadence: the epic has not confirmed the real interval yet.
const DEFAULT_REMINDER_CADENCE_HOURS = 12;
const HOUR_MS = 3600000;

const deliveryLogs = new Map();

function getDeliveryLog(runId) {
  return (deliveryLogs.get(runId) || []).map((e) => ({ ...e }));
}

function getRecipients(step) {
  return [
    { role: 'owner', label: step.owner },
    { role: 'hr', label: step.hrContact },
    { role: 'manager', label: step.managerContact },
  ];
}

function sendReminder(run, step, now) {
  const log = deliveryLogs.get(run.id) || [];
  deliveryLogs.set(run.id, log);
  const reminderNumber = step.remindersSent + 1;
  const message = `Step "${step.name}" is due ${step.dueAt}. Reminder ${reminderNumber} of ${step.maxReminders}.`;

  getRecipients(step).forEach((recipient) => {
    [['in-app', 'sendInApp'], ['email', 'sendEmail']].forEach(([channel, fn]) => {
      let outcome = 'delivered';
      let reason = null;
      try {
        const result = channels[fn](recipient, message);
        if (result && result.ok === false) {
          outcome = 'failed';
          reason = result.reason || 'Delivery failed';
        }
      } catch (err) {
        outcome = 'failed';
        reason = err.message;
      }
      log.push({
        ts: now.toISOString(),
        runId: run.id,
        stepId: step.id,
        reminderNumber,
        recipientRole: recipient.role,
        recipientLabel: recipient.label,
        channel,
        outcome,
        reason,
      });
    });
  });

  step.remindersSent = reminderNumber;
  step.lastReminderAt = now.toISOString();
}

function evaluateRun(run, now = new Date()) {
  if (run.status === 'completed') return;
  const step = run.steps[run.currentIndex];
  if (!step || !step.dueAt || step.status === 'done') return;
  if (step.remindersSent >= step.maxReminders) return;

  const windowOpensAt = new Date(step.dueAt).getTime() - step.reminderWindowHours * HOUR_MS;
  if (now.getTime() < windowOpensAt) return;

  if (step.remindersSent === 0
    || now.getTime() - new Date(step.lastReminderAt).getTime() >= step.reminderCadenceHours * HOUR_MS) {
    sendReminder(run, step, now);
  }
}

function sweepReminders(now = new Date()) {
  getActiveRuns().forEach((run) => evaluateRun(run, now));
}

function getReminderStatus(run) {
  const step = run.steps[run.currentIndex];
  if (!step || !step.dueAt) return null;
  const windowOpensAt = new Date(step.dueAt).getTime() - step.reminderWindowHours * HOUR_MS;
  return {
    stepId: step.id,
    stepName: step.name,
    dueAt: step.dueAt,
    reminderWindowHours: step.reminderWindowHours,
    maxReminders: step.maxReminders,
    remindersSent: step.remindersSent,
    ownerActed: step.status === 'done' || run.status === 'completed',
    windowReached: Date.now() >= windowOpensAt,
    capped: step.remindersSent >= step.maxReminders,
    recipients: getRecipients(step),
    deliveryLog: getDeliveryLog(run.id).filter((e) => e.stepId === step.id),
  };
}

module.exports = {
  evaluateRun,
  sweepReminders,
  getDeliveryLog,
  getReminderStatus,
  MAX_REMINDERS,
  DEFAULT_REMINDER_WINDOW_HOURS,
  DEFAULT_REMINDER_CADENCE_HOURS,
};
