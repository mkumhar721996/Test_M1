/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'runs.html');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const REASON = 'Vendor API timeout (504) — Dell fulfillment gateway did not respond within 30s.';

const baseRun = {
  id: 'RUN-4821',
  name: 'Onboarding: Jordan Lee',
  state: 'in-progress',
  startedAt: '2026-09-23T08:58:00.000Z',
  tasks: [
    { id: 'TASK-1', name: 'Create IT account', state: 'completed', attempts: 1, hrCoordinator: null, lastFailureReason: null, nextRetryAt: null, completedAt: '2026-09-23T08:59:03.000Z' },
    { id: 'TASK-2', name: 'Provision laptop asset', state: 'in-progress', attempts: 0, hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' }, lastFailureReason: null, nextRetryAt: null, completedAt: null },
    { id: 'TASK-3', name: 'Schedule orientation session', state: 'pending', attempts: 0, hrCoordinator: null, lastFailureReason: null, nextRetryAt: null, completedAt: null },
  ],
  auditLog: [],
  notifications: [],
};

function retryingRun(attempt) {
  return {
    ...baseRun,
    tasks: [
      baseRun.tasks[0],
      { ...baseRun.tasks[1], state: 'retrying', attempts: attempt, lastFailureReason: REASON },
      baseRun.tasks[2],
    ],
    auditLog: [
      { id: 'a1', runId: 'RUN-4821', taskId: 'TASK-2', taskName: 'Provision laptop asset', event: 'retry_scheduled', attempt, maxAttempts: 3, reason: REASON, backoffMs: attempt === 1 ? 30000 : 120000, timestamp: '2026-09-23T09:02:14.000Z' },
    ],
  };
}

function blockedRun() {
  return {
    ...baseRun,
    state: 'blocked',
    tasks: [
      baseRun.tasks[0],
      { ...baseRun.tasks[1], state: 'blocked', attempts: 3, lastFailureReason: REASON },
      baseRun.tasks[2],
    ],
    auditLog: [
      { id: 'a3', runId: 'RUN-4821', taskId: 'TASK-2', taskName: 'Provision laptop asset', event: 'blocked', attempt: 3, maxAttempts: 3, reason: REASON, timestamp: '2026-09-23T09:07:41.000Z' },
    ],
    notifications: [
      { id: 'n1', runId: 'RUN-4821', taskId: 'TASK-2', coordinatorEmail: 'priya.nair@northlake-hr.example', text: 'Task blocked: "Provision laptop asset" on RUN-4821 (Onboarding: Jordan Lee) failed 3 times and needs your review.', time: '2026-09-23T09:07:41.000Z' },
    ],
  };
}

function resolvedRun() {
  return {
    ...baseRun,
    tasks: [
      baseRun.tasks[0],
      { ...baseRun.tasks[1], state: 'in-progress', attempts: 0, lastFailureReason: null },
      baseRun.tasks[2],
    ],
    auditLog: [
      { id: 'a4', runId: 'RUN-4821', taskId: 'TASK-2', taskName: 'Provision laptop asset', event: 'resolved', attempt: 3, maxAttempts: 3, reason: 'Fixed manually', resolver: 'Priya Nair — HR Coordinator', timestamp: '2026-09-23T09:12:00.000Z' },
    ],
  };
}

describe('Run Detail page', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1/AC2: renders the seeded run and simulating a failure moves the task into retrying with backoff', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => jsonResponse(baseRun))
      .mockImplementationOnce(() => jsonResponse(retryingRun(1)));

    const { initRunsPage } = require('../public/js/runs');
    await initRunsPage(document, 'RUN-4821');
    await flush();

    expect(document.getElementById('run-name').textContent).toBe('Onboarding: Jordan Lee');
    expect(document.getElementById('run-status-chip').textContent).toContain('In progress');
    expect(document.querySelectorAll('.task-card')).toHaveLength(3);

    document.getElementById('simulate-btn').click();
    await flush();
    await flush();

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/runs/RUN-4821/tasks/TASK-2/failures',
      expect.objectContaining({ method: 'POST' })
    );
    const chip = document.getElementById('focus-task-card').querySelector('.chip-active');
    expect(chip.textContent).toContain('Retrying');
    expect(document.getElementById('backoff-track').querySelector('[data-step="1"]').classList.contains('is-current')).toBe(true);
    expect(document.getElementById('audit-tbody').textContent).toContain('Vendor API timeout');
  });

  test('AC3/AC4: the third failure shows the blocked banner and a notification badge', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => jsonResponse(retryingRun(2)))
      .mockImplementationOnce(() => jsonResponse(blockedRun()));

    const { initRunsPage } = require('../public/js/runs');
    await initRunsPage(document, 'RUN-4821');
    await flush();

    document.getElementById('simulate-btn').click();
    await flush();
    await flush();

    expect(document.getElementById('blocked-banner')).not.toBeNull();
    expect(document.getElementById('run-status-chip').textContent).toContain('Blocked');
    expect(document.getElementById('notif-badge').hidden).toBe(false);
    expect(document.getElementById('notif-badge').textContent).toBe('1');
    expect(document.getElementById('resolve-btn').hidden).toBe(false);
  });

  test('AC5: resolving a blocked task via the modal returns the task to in-progress', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => jsonResponse(blockedRun()))
      .mockImplementationOnce(() => jsonResponse(resolvedRun()));

    const { initRunsPage } = require('../public/js/runs');
    await initRunsPage(document, 'RUN-4821');
    await flush();

    document.getElementById('resolve-btn').click();
    expect(document.getElementById('modal-wrap').hidden).toBe(false);

    document.getElementById('resolver-select').value = 'Priya Nair — HR Coordinator';
    document.getElementById('resolution-note').value = 'Fixed manually';
    document.getElementById('resolve-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await flush();

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/runs/RUN-4821/tasks/TASK-2/resolution',
      expect.objectContaining({ method: 'POST' })
    );
    expect(document.getElementById('modal-wrap').hidden).toBe(true);
    expect(document.getElementById('focus-task-card').querySelector('.chip').textContent).toContain('In progress');
  });

  test('AC6: audit log rows include attempt number, failure reason, and timestamp', async () => {
    global.fetch = jest.fn().mockImplementationOnce(() => jsonResponse(retryingRun(1)));

    const { initRunsPage } = require('../public/js/runs');
    await initRunsPage(document, 'RUN-4821');
    await flush();

    const row = document.querySelector('#audit-tbody tr');
    expect(row.textContent).toContain('1 of 3');
    expect(row.textContent).toContain('Vendor API timeout (504)');
    expect(row.textContent).toContain('2026-09-23');
  });
});
