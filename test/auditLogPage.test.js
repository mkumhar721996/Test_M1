/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'audit-log.html');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const ENTRIES = [
  { id: 'e1', runId: 'RUN-4821', taskId: 'TASK-2', taskName: 'Provision laptop asset', event: 'blocked', attempt: 3, maxAttempts: 3, reason: 'Vendor API timeout (504).', timestamp: '2026-09-23T09:07:41.000Z' },
  { id: 'e2', runId: 'RUN-4821', taskId: 'TASK-2', taskName: 'Provision laptop asset', event: 'retry_scheduled', attempt: 2, maxAttempts: 3, reason: 'Vendor API timeout (504).', backoffMs: 120000, timestamp: '2026-09-23T09:04:52.000Z' },
  { id: 'e3', runId: 'RUN-4798', taskId: 'TASK-9', taskName: 'Send welcome kit', event: 'resolved', attempt: 3, maxAttempts: 3, reason: 'Carrier tracking restored', resolver: 'Sam Okafor — Platform Admin', timestamp: '2026-09-22T16:41:09.000Z' },
];

describe('Audit Log page', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC6: fetches and renders every retry, block, and resolution event with attempt, detail, and timestamp', async () => {
    global.fetch = jest.fn().mockImplementationOnce(() => jsonResponse(ENTRIES));

    const { initAuditLogPage } = require('../public/js/audit-log');
    await initAuditLogPage(document);
    await flush();

    expect(global.fetch).toHaveBeenCalledWith('/audit-log');
    const rows = document.querySelectorAll('#audit-tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('RUN-4821');
    expect(rows[0].textContent).toContain('Provision laptop asset');
    expect(rows[0].textContent).toContain('3 of 3');
    expect(document.getElementById('audit-note').textContent).toContain('Showing 3 of 3 events');
  });

  test('AC6: shows an empty state when no events exist yet', async () => {
    global.fetch = jest.fn().mockImplementationOnce(() => jsonResponse([]));

    const { initAuditLogPage } = require('../public/js/audit-log');
    await initAuditLogPage(document);
    await flush();

    expect(document.querySelector('#audit-tbody .audit-empty')).not.toBeNull();
  });
});
