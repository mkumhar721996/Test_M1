const auditLog = require('../src/runs/auditLog');

test('record() returns an entry with an id and the given fields', () => {
  const entry = auditLog.record({
    runId: 'r1',
    taskId: 't1',
    taskName: 'Provision laptop asset',
    event: 'retry_scheduled',
    attempt: 1,
    maxAttempts: 3,
    reason: 'Vendor API timeout (504)',
    timestamp: '2026-09-23T09:02:14.000Z',
  });
  expect(entry.id).toBeDefined();
  expect(entry.runId).toBe('r1');
  expect(entry.attempt).toBe(1);
  expect(entry.reason).toBe('Vendor API timeout (504)');
  expect(entry.timestamp).toBe('2026-09-23T09:02:14.000Z');
});

test('a recorded entry cannot be changed after the fact', () => {
  const entry = auditLog.record({ runId: 'r', taskId: 't', taskName: 'n', event: 'retry_scheduled', attempt: 1, maxAttempts: 3, reason: 'x', timestamp: 'now' });
  expect(Object.isFrozen(entry)).toBe(true);
  entry.attempt = 99;
  expect(entry.attempt).toBe(1);
});

test('auditLog module exposes no update or delete function', () => {
  expect(auditLog.update).toBeUndefined();
  expect(auditLog.delete).toBeUndefined();
});

test('list() returns entries newest first', () => {
  auditLog.record({ runId: 'r2', taskId: 't2', taskName: 'n', event: 'retry_scheduled', attempt: 1, maxAttempts: 3, reason: 'x', timestamp: '2026-01-01T00:00:00.000Z' });
  auditLog.record({ runId: 'r2', taskId: 't2', taskName: 'n', event: 'blocked', attempt: 3, maxAttempts: 3, reason: 'x', timestamp: '2026-01-02T00:00:00.000Z' });
  const all = auditLog.list();
  const r2Entries = all.filter((e) => e.runId === 'r2');
  expect(r2Entries[0].event).toBe('blocked');
  expect(r2Entries[1].event).toBe('retry_scheduled');
});

test('listForRun() only returns entries for that run', () => {
  auditLog.record({ runId: 'r3', taskId: 't3', taskName: 'n', event: 'retry_scheduled', attempt: 1, maxAttempts: 3, reason: 'x', timestamp: '2026-01-01T00:00:00.000Z' });
  const forR3 = auditLog.listForRun('r3');
  expect(forR3.every((e) => e.runId === 'r3')).toBe(true);
  expect(forR3.length).toBeGreaterThan(0);
});
