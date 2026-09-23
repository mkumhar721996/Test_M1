const { notifyCoordinatorPaused } = require('./notifications');

class RunTransitionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function assertAuthorized(run, actor) {
  const isAssignedCoordinator = Boolean(actor.id) && actor.id === run.assignedCoordinatorId;
  const isPlatformAdmin = actor.role === 'platform_admin';
  if (!isAssignedCoordinator && !isPlatformAdmin) {
    throw new RunTransitionError('FORBIDDEN', 'actor is not authorized to manage this run');
  }
}

function recordAudit(run, actor, priorState, newState) {
  run.auditLog.push(Object.freeze({
    actor: actor.id,
    timestamp: new Date().toISOString(),
    priorState,
    newState,
  }));
}

function pauseRun(run, actor) {
  assertAuthorized(run, actor);
  if (!['started', 'blocked'].includes(run.state)) {
    throw new RunTransitionError('INVALID_STATE', `cannot pause a run in state '${run.state}'`);
  }
  const priorState = run.state;
  run.state = 'paused';
  recordAudit(run, actor, priorState, 'paused');
  notifyCoordinatorPaused(run);
  return run;
}

function resumeRun(run, actor) {
  assertAuthorized(run, actor);
  if (run.state !== 'paused') {
    throw new RunTransitionError('INVALID_STATE', `cannot resume a run in state '${run.state}'`);
  }
  const priorState = run.state;
  run.state = 'started';
  recordAudit(run, actor, priorState, 'started');
  return run;
}

function cancelRun(run, actor) {
  assertAuthorized(run, actor);
  if (!['started', 'blocked', 'paused'].includes(run.state)) {
    throw new RunTransitionError('INVALID_STATE', `cannot cancel a run in state '${run.state}'`);
  }
  const priorState = run.state;
  run.tasks.forEach((task) => {
    if (task.state === 'in_progress') {
      task.flaggedForManualCleanup = true;
      task.cancellationSnapshot = { state: task.state, progress: task.progress ?? null, capturedAt: new Date().toISOString() };
    }
  });
  run.state = 'cancelled';
  recordAudit(run, actor, priorState, 'cancelled');
  return run;
}

function getNextDispatchableTask(run) {
  if (run.state !== 'started') return null;
  return run.tasks.find((t) => t.state === 'pending') || null;
}

module.exports = { pauseRun, resumeRun, cancelRun, getNextDispatchableTask, RunTransitionError };
