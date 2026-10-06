/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'employees.html');

function fixtureActiveEmployee() {
  return { id: 'emp_c001', name: 'Priya Nair', email: 'priya@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-01-05', employmentStatus: 'active' };
}
function fixtureDeactivatedEmployee() {
  return { ...fixtureActiveEmployee(), id: 'emp_c003', name: 'Marcus Chen', employmentStatus: 'deactivated' };
}

let initEmployeesListApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initEmployeesListApp } = require('../public/js/employees'));
});

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('action button label toggles with status', () => {
  initEmployeesListApp(document, [fixtureActiveEmployee(), fixtureDeactivatedEmployee()], {}, () => 'hr');
  const labels = [...document.querySelectorAll('[data-lifecycle-id]')].map((b) => b.textContent);
  expect(labels).toEqual(['Deactivate', 'Reactivate']);
});

test('status filter narrows the rows', () => {
  initEmployeesListApp(document, [fixtureActiveEmployee(), fixtureDeactivatedEmployee()], {}, () => 'hr');
  const filter = document.getElementById('status-filter');
  filter.value = 'deactivated';
  filter.dispatchEvent(new Event('change'));
  expect(document.querySelectorAll('[data-lifecycle-id]')).toHaveLength(1);
  expect(document.querySelector('.status-chip').textContent).toContain('Deactivated');
});

test('AC1: confirming a deactivate updates the row chip', async () => {
  const api = { deactivate: jest.fn().mockResolvedValue({ ...fixtureActiveEmployee(), employmentStatus: 'deactivated' }) };
  initEmployeesListApp(document, [fixtureActiveEmployee()], api, () => 'hr');
  document.querySelector('[data-lifecycle-id]').click();
  document.getElementById('confirm-action-btn').click();
  await flush();
  expect(api.deactivate).toHaveBeenCalledWith('emp_c001');
  expect(document.querySelector('.status-chip').textContent).toContain('Deactivated');
});

test('AC2: confirming a reactivate updates the row chip', async () => {
  const api = { reactivate: jest.fn().mockResolvedValue({ ...fixtureDeactivatedEmployee(), employmentStatus: 'active' }) };
  initEmployeesListApp(document, [fixtureDeactivatedEmployee()], api, () => 'manager');
  document.querySelector('[data-lifecycle-id]').click();
  document.getElementById('confirm-action-btn').click();
  await flush();
  expect(document.querySelector('.status-chip').textContent).toContain('Active');
});

test('AC3/AC4: a rejected request leaves the chip unchanged and shows the rejection toast', async () => {
  const api = { deactivate: jest.fn().mockRejectedValue({ status: 403 }) };
  initEmployeesListApp(document, [fixtureActiveEmployee()], api, () => 'employee');
  expect(document.getElementById('role-banner').hidden).toBe(false);
  document.querySelector('[data-lifecycle-id]').click();
  document.getElementById('confirm-action-btn').click();
  await flush();
  expect(document.querySelector('.status-chip').textContent).toContain('Active');
  expect(document.getElementById('toast-message').textContent).toMatch(/Request rejected/i);
});

test('role banner is hidden for HR', () => {
  initEmployeesListApp(document, [fixtureActiveEmployee()], {}, () => 'hr');
  expect(document.getElementById('role-banner').hidden).toBe(true);
});

test('AC6: clicking a name link navigates to the profile', () => {
  const onViewEmployee = jest.fn();
  initEmployeesListApp(document, [fixtureActiveEmployee()], {}, () => 'manager', onViewEmployee);
  document.querySelector('[data-view-id]').click();
  expect(onViewEmployee).toHaveBeenCalledWith('emp_c001');
});
