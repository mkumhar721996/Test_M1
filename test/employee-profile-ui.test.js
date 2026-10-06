/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'employee.html');

function fixtureEmployee() {
  return { id: 'emp_c001', name: 'Priya Nair', email: 'priya@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-01-05', employmentStatus: 'active' };
}

let app;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  app = require('../public/js/employee');
});

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('renders full details for a deactivated employee (AC6)', () => {
  app.initEmployeeProfileApp(document, { ...fixtureEmployee(), employmentStatus: 'deactivated' }, {});
  expect(document.getElementById('profile-name').textContent).toBe('Priya Nair');
  expect(document.getElementById('profile-email').textContent).toBe('priya@example.com');
  expect(document.getElementById('profile-start-date').textContent).toBe('01/05/2026');
  expect(document.getElementById('profile-status-chip').textContent).toContain('Deactivated');
  expect(document.getElementById('profile-lifecycle-btn').textContent).toBe('Reactivate');
});

test('AC6: unknown employee shows the not-found state', () => {
  app.showEmployeeNotFound(document);
  expect(document.getElementById('profile-empty-state').hidden).toBe(false);
  expect(document.getElementById('profile-fieldset').hidden).toBe(true);
});

test('AC7: confirming a status change updates the chip immediately', async () => {
  let resolveDeactivate;
  const api = { deactivate: () => new Promise((resolve) => { resolveDeactivate = resolve; }) };
  app.initEmployeeProfileApp(document, fixtureEmployee(), api);
  document.getElementById('profile-lifecycle-btn').click();
  document.getElementById('confirm-action-btn').click();
  resolveDeactivate({ ...fixtureEmployee(), employmentStatus: 'deactivated', history: [{ status: 'deactivated', actor: 'HR', at: '2026-10-06T10:00:00.000Z' }] });
  await flush();
  expect(document.getElementById('profile-status-chip').textContent).toContain('Deactivated');
  expect(document.getElementById('profile-lifecycle-btn').textContent).toBe('Reactivate');
  expect(document.querySelectorAll('.history-item')).toHaveLength(1);
});

test('AC3/AC4: a rejected request keeps the status and shows the rejection toast', async () => {
  const api = { deactivate: jest.fn().mockRejectedValue({ status: 403 }) };
  app.initEmployeeProfileApp(document, fixtureEmployee(), api, () => 'employee');
  expect(document.getElementById('profile-role-banner').hidden).toBe(false);
  document.getElementById('profile-lifecycle-btn').click();
  document.getElementById('confirm-action-btn').click();
  await flush();
  expect(document.getElementById('profile-status-chip').textContent).toContain('Active');
  expect(document.getElementById('toast-message').textContent).toMatch(/Request rejected/i);
});
