/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'audit-log.html');

let initAuditLogApp;
let showError;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initAuditLogApp, showError } = require('../public/js/audit-log'));
});

const entry = (overrides) => ({ id: 'a1', at: '2026-10-01T00:00:00Z', actorName: 'Marcus Chen', actorRole: 'Manager', action: 'Attempted to view profile', targetId: 'hire_2031', targetName: 'Jordan Reyes', result: 'denied', detail: "Not one of Marcus Chen's direct reports.", ...overrides });

test('AC11: denied rows render with the denied chip, allowed with the allowed chip', () => {
  initAuditLogApp(document, [entry(), entry({ id: 'a2', result: 'allowed', action: 'Viewed profile' })]);
  expect(document.querySelectorAll('#audit-tbody tr')).toHaveLength(2);
  expect(document.querySelector('.result-chip.denied')).not.toBeNull();
  expect(document.querySelector('.result-chip.allowed')).not.toBeNull();
  expect(document.getElementById('audit-tbody').textContent).toContain("Marcus Chen's direct reports");
});

test('entry text is escaped', () => {
  initAuditLogApp(document, [entry({ targetName: '<img src=x>' })]);
  expect(document.querySelector('#audit-tbody img')).toBeNull();
});

test('a 403 shows an HR-only message instead of rows', () => {
  showError(document, { status: 403 });
  expect(document.getElementById('audit-error-state').hidden).toBe(false);
  expect(document.getElementById('audit-error-text').textContent).toContain('HR admin');
});
