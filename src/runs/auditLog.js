const crypto = require('crypto');

const RUN_EVENT_TYPES = ['started', 'paused', 'resumed', 'cancelled', 'blocked', 'completed', 'failed'];
const TASK_EVENT_TYPES = ['dispatched', 'retried', 'blocked', 'timed_out', 'completed', 'skipped'];
const DEFAULT_TENANT_ID = 'default-tenant';

// Append-only: module-private, and no update/delete/clear function is exported.
const entries = [];

function append(entry, eventType, allowedTypes) {
  if (!entry.tenantId) throw new Error('tenantId is required');
  if (!allowedTypes.includes(eventType)) throw new Error(`unknown event type: ${eventType}`);
  const frozen = Object.freeze({ id: crypto.randomUUID(), ...entry, eventType });
  entries.push(frozen);
  return frozen;
}

function recordRunEvent({ runId, tenantId, projectId = null, eventType, actor, priorState, newState, ts }) {
  return append(
    { kind: 'run', runId, tenantId, projectId, actor, priorState, newState, ts: ts || new Date().toISOString() },
    eventType,
    RUN_EVENT_TYPES,
  );
}

function recordTaskEvent({ runId, tenantId, projectId = null, taskId, eventType, ts }) {
  return append(
    { kind: 'task', runId, tenantId, projectId, taskId, ts: ts || new Date().toISOString() },
    eventType,
    TASK_EVENT_TYPES,
  );
}

function listAuditEntries({ tenantId, projectId = null, runId } = {}) {
  if (!tenantId) throw new Error('tenantId is required');
  return entries.filter(
    (e) => e.tenantId === tenantId && (!projectId || e.projectId === projectId) && (!runId || e.runId === runId),
  );
}

module.exports = { recordRunEvent, recordTaskEvent, listAuditEntries, RUN_EVENT_TYPES, TASK_EVENT_TYPES, DEFAULT_TENANT_ID };
