/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'run-detail.html');

function fixtureRunWithReminders({ remindersSent, maxReminders }) {
  return {
    id: 'run_1',
    status: 'active',
    hire: null,
    currentIndex: 0,
    steps: [{ id: 's1', name: 'Provision IT', owner: 'IT — Devon Ruiz', description: '', status: 'current' }],
    auditLog: [],
    reminders: {
      stepId: 's1',
      stepName: 'Provision IT',
      dueAt: '2026-10-07T17:00:00.000Z',
      reminderWindowHours: 48,
      maxReminders,
      remindersSent,
      ownerActed: false,
      windowReached: true,
      capped: remindersSent >= maxReminders,
      recipients: [{ role: 'owner', label: 'IT — Devon Ruiz' }, { role: 'hr', label: 'HR — Priya Shah' }],
      deliveryLog: [
        { ts: '2026-10-05T10:00:00.000Z', recipientRole: 'owner', recipientLabel: 'IT — Devon Ruiz', channel: 'email', outcome: 'failed', reason: 'Mailbox unavailable' },
        { ts: '2026-10-05T10:00:00.000Z', recipientRole: 'hr', recipientLabel: 'HR — Priya Shah', channel: 'in-app', outcome: 'delivered' },
      ],
    },
  };
}

describe('Run Detail reminders UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC2+AC3: capped state and failure rendered as icon-plus-text', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRunWithReminders({ remindersSent: 5, maxReminders: 5 }), {});
    expect(document.getElementById('reminder-card').hidden).toBe(false);
    expect(document.getElementById('reminder-state-pill').textContent).toContain('Reminder limit reached (5 of 5)');
    expect(document.getElementById('check-reminders-btn').disabled).toBe(true);
    const row = document.querySelector('#reminder-log-body tr');
    expect(row.textContent).toContain('Devon Ruiz');
    expect(row.querySelector('.outcome-fail').textContent).toContain('Failed');
  });

  test('AC1: partial state shows progress and recipients; hidden without a deadline', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRunWithReminders({ remindersSent: 2, maxReminders: 5 }), {});
    expect(document.getElementById('reminder-state-pill').textContent).toContain('Reminder 2 of 5 sent');
    expect(document.getElementById('reminder-progress-label').textContent).toBe('2 of 5 sent');
    expect(document.querySelectorAll('#reminder-recipients-row .chip').length).toBeGreaterThanOrEqual(2);

    const noDue = fixtureRunWithReminders({ remindersSent: 0, maxReminders: 5 });
    noDue.reminders = null;
    initRunDetailApp(document, noDue, {});
    expect(document.getElementById('reminder-card').hidden).toBe(true);
  });

  test('check button calls api.checkReminders and re-renders', async () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    const updated = fixtureRunWithReminders({ remindersSent: 3, maxReminders: 5 }).reminders;
    const api = { checkReminders: jest.fn().mockResolvedValue(updated) };
    initRunDetailApp(document, fixtureRunWithReminders({ remindersSent: 2, maxReminders: 5 }), api);
    document.getElementById('check-reminders-btn').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(api.checkReminders).toHaveBeenCalled();
    expect(document.getElementById('reminder-state-pill').textContent).toContain('Reminder 3 of 5 sent');
  });
});
