const crypto = require('crypto');

const deliveryLog = [];

const CHANNELS = ['In-app', 'Email'];

function resolveRecipients(run, step) {
  const notify = run.notifyRecipients || { hr: null, managers: [] };
  const candidates = [];
  if (notify.hr) candidates.push({ name: notify.hr.name, email: notify.hr.email, role: 'HR' });
  (notify.managers || []).forEach((m) => candidates.push({ name: m.name, email: m.email, role: 'Relevant manager' }));
  if (step.ownerName) {
    candidates.push({ name: step.ownerName, email: step.ownerEmail, role: `Step owner — ${step.ownerTitle}` });
  }

  const byKey = new Map();
  candidates.forEach((c) => {
    const key = c.email || c.name;
    const existing = byKey.get(key);
    if (existing) existing.role = `${existing.role} & ${c.role}`;
    else byKey.set(key, { ...c });
  });
  return Array.from(byKey.values());
}

function deliver(recipient, channel) {
  if (channel === 'Email' && !recipient.email) {
    return {
      status: 'failed',
      errorCode: 'NO_EMAIL_ADDRESS',
      detail: `No email address on file for ${recipient.name}.`,
    };
  }
  const destination = channel === 'Email' ? recipient.email : `inbox of ${recipient.name}`;
  return { status: 'delivered', errorCode: null, detail: `${channel} alert accepted for ${destination}.` };
}

function fireBlockedStepAlert(run, step) {
  const notificationId = `ntf_${crypto.randomUUID()}`;
  const recipients = resolveRecipients(run, step);
  recipients.forEach((recipient) => {
    CHANNELS.forEach((channel) => {
      const outcome = deliver(recipient, channel);
      const entry = {
        id: crypto.randomUUID(),
        notificationId,
        runId: run.id,
        stepId: step.id,
        recipientName: recipient.name,
        recipientRole: recipient.role,
        channel,
        status: outcome.status,
        detail: outcome.detail,
        errorCode: outcome.errorCode,
        retryCount: 0,
        createdAt: new Date().toISOString(),
      };
      deliveryLog.push(entry);
      const line = `[notifications] ${notificationId} run=${run.id} step=${step.id} recipient="${recipient.name}" channel=${channel} status=${entry.status}${entry.errorCode ? ` error=${entry.errorCode}` : ''}`;
      if (entry.status === 'failed') console.error(line);
      else console.log(line);
    });
  });
}

function listDeliveryLog({ runId, status } = {}) {
  return deliveryLog
    .filter((e) => !runId || e.runId === runId)
    .filter((e) => !status || status === 'all' || e.status === status)
    .map((e) => ({ ...e }));
}

module.exports = { resolveRecipients, fireBlockedStepAlert, listDeliveryLog };
