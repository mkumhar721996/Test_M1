const crypto = require('crypto');
const { getLatestVersion } = require('../workflows/store');
const { MAX_ATTEMPTS, computeBackoffMs } = require('./retryPolicy');
const auditLog = require('./auditLog');
const notifications = require('./notifications');

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

const runs = new Map();

function startRun(workflowId) {
  const definition = getLatestVersion(workflowId);
  if (!definition) return undefined;
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    definitionVersion: definition.version,
    taskGraph: definition.taskGraph,
  };
  runs.set(run.id, run);
  return run;
}

function createRun({ id, name, tasks = [] }) {
  const runId = id || `RUN-${crypto.randomUUID().slice(0, 8)}`;
  const run = {
    id: runId,
    name,
    state: 'in-progress',
    startedAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({
      id: crypto.randomUUID(),
      name: t.name,
      state: t.state || 'in-progress',
      attempts: 0,
      hrCoordinator: t.hrCoordinator || null,
      lastFailureReason: null,
      nextRetryAt: null,
      completedAt: null,
    })),
  };
  runs.set(run.id, run);
  return getRunDetail(run.id);
}

function lookup(runId, taskId) {
  const run = runs.get(runId);
  if (!run) throw new NotFoundError('run not found');
  const task = run.tasks.find((t) => t.id === taskId);
  if (!task) throw new NotFoundError('task not found');
  return { run, task };
}

function recordTaskFailure(runId, taskId, reason) {
  const { run, task } = lookup(runId, taskId);
  task.attempts += 1;
  task.lastFailureReason = reason;
  const timestamp = new Date().toISOString();

  if (task.attempts < MAX_ATTEMPTS) {
    task.state = 'retrying';
    const backoffMs = computeBackoffMs(task.attempts);
    task.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    auditLog.record({
      runId,
      taskId,
      taskName: task.name,
      event: 'retry_scheduled',
      attempt: task.attempts,
      maxAttempts: MAX_ATTEMPTS,
      reason,
      backoffMs,
      timestamp,
    });
  } else {
    task.state = 'blocked';
    task.nextRetryAt = null;
    run.state = 'blocked';
    auditLog.record({
      runId,
      taskId,
      taskName: task.name,
      event: 'blocked',
      attempt: task.attempts,
      maxAttempts: MAX_ATTEMPTS,
      reason,
      timestamp,
    });
    if (task.hrCoordinator) {
      notifications.notifyHrCoordinator({ coordinator: task.hrCoordinator, run, task, reason, timestamp });
    }
  }

  return getRunDetail(runId);
}

function resolveTask(runId, taskId, { resolver, note }) {
  const { run, task } = lookup(runId, taskId);
  if (task.state !== 'blocked') throw new ConflictError('task is not blocked');

  task.state = 'in-progress';
  task.attempts = 0;
  task.nextRetryAt = null;
  task.lastFailureReason = null;
  run.state = run.tasks.some((t) => t.state === 'blocked') ? 'blocked' : 'in-progress';
  const timestamp = new Date().toISOString();

  auditLog.record({
    runId,
    taskId,
    taskName: task.name,
    event: 'resolved',
    attempt: MAX_ATTEMPTS,
    maxAttempts: MAX_ATTEMPTS,
    reason: note,
    resolver,
    timestamp,
  });

  return getRunDetail(runId);
}

function getRunDetail(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  return {
    id: run.id,
    name: run.name,
    state: run.state,
    startedAt: run.startedAt,
    tasks: run.tasks.map((t) => ({ ...t })),
    auditLog: auditLog.listForRun(runId),
    notifications: notifications.listAlertsFor(runId),
  };
}

function getRun(runId) {
  const run = runs.get(runId);
  if (!run) return undefined;
  // Runs started from a workflow definition (Run Lifecycle / Version Pinning) carry a
  // pinned taskGraph and have no task-retry state; return them as-is for backward
  // compatibility with that flow instead of composing retry/audit/notification data.
  if (run.taskGraph) return run;
  return getRunDetail(runId);
}

function seedDemoRun() {
  const runId = 'RUN-4821';
  if (runs.has(runId)) return;
  runs.set(runId, {
    id: runId,
    name: 'Onboarding: Jordan Lee',
    state: 'in-progress',
    startedAt: '2026-09-23T08:58:00.000Z',
    tasks: [
      {
        id: 'TASK-4821-1',
        name: 'Create IT account',
        state: 'completed',
        attempts: 1,
        hrCoordinator: null,
        lastFailureReason: null,
        nextRetryAt: null,
        completedAt: '2026-09-23T08:59:03.000Z',
      },
      {
        id: 'TASK-4821-2',
        name: 'Provision laptop asset',
        state: 'in-progress',
        attempts: 0,
        hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' },
        lastFailureReason: null,
        nextRetryAt: null,
        completedAt: null,
      },
      {
        id: 'TASK-4821-3',
        name: 'Schedule orientation session',
        state: 'pending',
        attempts: 0,
        hrCoordinator: null,
        lastFailureReason: null,
        nextRetryAt: null,
        completedAt: null,
      },
    ],
  });
}

seedDemoRun();

module.exports = {
  startRun,
  getRun,
  createRun,
  getRunDetail,
  recordTaskFailure,
  resolveTask,
  NotFoundError,
  ConflictError,
};
