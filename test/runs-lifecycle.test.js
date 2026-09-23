const { createRun } = require('../src/runs/store');
const { pauseRun, resumeRun, cancelRun, getNextDispatchableTask, RunTransitionError } = require('../src/runs/lifecycle');
const { getInAppAlertsFor, getEmailQueueFor } = require('../src/runs/notifications');

const coordinator = { id: 'coord_1', role: 'hr_coordinator' };

test('pausing a started run moves it to paused, blocks dispatch, and notifies the coordinator', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [{ id: 't1', state: 'pending' }] });
  const updated = pauseRun(run, coordinator);

  expect(updated.state).toBe('paused');
  expect(getNextDispatchableTask(updated)).toBeNull();
  expect(getInAppAlertsFor('coord_1').length).toBeGreaterThan(0);
  expect(getEmailQueueFor('coord_1').length).toBeGreaterThan(0);
});

test('pausing a blocked run moves it to paused, blocks dispatch, and notifies the coordinator', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_2', state: 'blocked', tasks: [{ id: 't1', state: 'pending' }] });
  const updated = pauseRun(run, { id: 'coord_2', role: 'hr_coordinator' });

  expect(updated.state).toBe('paused');
  expect(getNextDispatchableTask(updated)).toBeNull();
  expect(getInAppAlertsFor('coord_2').length).toBeGreaterThan(0);
  expect(getEmailQueueFor('coord_2').length).toBeGreaterThan(0);
});

test('resuming a paused run returns to started and continues dispatching the same pending task', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [{ id: 't1', state: 'pending' }] });
  pauseRun(run, coordinator);
  expect(getNextDispatchableTask(run)).toBeNull();

  const updated = resumeRun(run, coordinator);

  expect(updated.state).toBe('started');
  expect(getNextDispatchableTask(updated).id).toBe('t1');
});

test('cancelling flags in-flight tasks for manual cleanup with a snapshot of their completion state', () => {
  const run = createRun({
    assignedCoordinatorId: 'coord_1',
    state: 'started',
    tasks: [
      { id: 't1', state: 'in_progress', progress: 0.6 },
      { id: 't2', state: 'completed' },
    ],
  });

  const updated = cancelRun(run, coordinator);

  expect(updated.state).toBe('cancelled');
  const t1 = updated.tasks.find((t) => t.id === 't1');
  expect(t1.state).toBe('in_progress');
  expect(t1.flaggedForManualCleanup).toBe(true);
  expect(t1.cancellationSnapshot).toMatchObject({ state: 'in_progress', progress: 0.6 });
  const t2 = updated.tasks.find((t) => t.id === 't2');
  expect(t2.flaggedForManualCleanup).toBeUndefined();
});

test('cancelling a run with no in-progress tasks succeeds without flagging anything', () => {
  const run = createRun({
    assignedCoordinatorId: 'coord_1',
    state: 'started',
    tasks: [{ id: 't1', state: 'pending' }, { id: 't2', state: 'completed' }],
  });
  const updated = cancelRun(run, coordinator);
  expect(updated.state).toBe('cancelled');
  expect(updated.tasks.every((t) => !t.flaggedForManualCleanup)).toBe(true);
});

test('every lifecycle transition appends an immutable entry to the audit log', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });

  pauseRun(run, coordinator);
  const entry = run.auditLog[0];
  expect(entry).toMatchObject({ actor: 'coord_1', priorState: 'started', newState: 'paused' });
  expect(typeof entry.timestamp).toBe('string');

  entry.newState = 'tampered';
  expect(run.auditLog[0].newState).toBe('paused');
});

test('the audit log records the correct sequence across pause, resume, and cancel', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });

  pauseRun(run, coordinator);
  resumeRun(run, coordinator);
  cancelRun(run, coordinator);

  expect(run.auditLog.map((e) => [e.priorState, e.newState])).toEqual([
    ['started', 'paused'],
    ['paused', 'started'],
    ['started', 'cancelled'],
  ]);
});

test('pausing an already-paused run is rejected and leaves state and audit log unchanged', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'paused', tasks: [] });
  expect(() => pauseRun(run, coordinator)).toThrow(RunTransitionError);
  expect(run.state).toBe('paused');
  expect(run.auditLog).toHaveLength(0);
});

test('resuming a run that is not paused is rejected', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  expect(() => resumeRun(run, coordinator)).toThrow(RunTransitionError);
});

test('cancelling an already-cancelled run is rejected', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'cancelled', tasks: [] });
  expect(() => cancelRun(run, coordinator)).toThrow(RunTransitionError);
});

test('an actor who is neither the assigned coordinator nor a platform admin cannot pause, resume, or cancel', () => {
  const pausable = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const pausedRun = createRun({ assignedCoordinatorId: 'coord_1', state: 'paused', tasks: [] });
  const cancellable = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const stranger = { id: 'someone_else', role: 'employee' };

  expect(() => pauseRun(pausable, stranger)).toThrow(RunTransitionError);
  expect(() => resumeRun(pausedRun, stranger)).toThrow(RunTransitionError);
  expect(() => cancelRun(cancellable, stranger)).toThrow(RunTransitionError);
});

test('a platform_admin actor is permitted even when their id differs from the assigned coordinator', () => {
  const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
  const updated = pauseRun(run, { id: 'admin_9', role: 'platform_admin' });
  expect(updated.state).toBe('paused');
});
