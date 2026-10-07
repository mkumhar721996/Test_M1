/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'employee-directory.html');

const emp = (id, name, department, role, employmentStatus = 'active') => ({
  id, name, email: `${id}@example.com`, department, role, startDate: '2026-01-05', employmentStatus,
});
const priya = () => emp('emp_c004', 'Priya Nair', 'Finance', 'Financial Analyst');
const lena = () => emp('emp_c008', 'Lena Voss', 'Finance', 'Finance Manager', 'deactivated');
const sofiaOps = () => emp('emp_c010', 'Sofia Russo', 'People Ops', 'Recruiter');
const sofiaMarketing = () => emp('emp_c011', 'Sofia Russo', 'Marketing', 'Social Media Coordinator');
const noahSales = () => emp('emp_c007', 'Noah Kim', 'Sales', 'Sales Manager');
const siobhan = () => emp('emp_c012', "Siobhán O'Connor-Reyes", 'Engineering', 'Staff Engineer');

let initEmployeeDirectoryApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initEmployeeDirectoryApp } = require('../public/js/employee-directory'));
});

const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };
const $ = (id) => document.getElementById(id);
const rows = () => document.querySelectorAll('#directory-tbody [data-view-id]');
function type(id, value, evt = 'input') {
  $(id).value = value;
  $(id).dispatchEvent(new Event(evt));
}
async function load(list, role = 'hr', onView) {
  const api = { list: jest.fn().mockResolvedValue(list) };
  initEmployeeDirectoryApp(document, api, () => role, onView);
  await flush();
  return api;
}

test('AC1: HR sees the full directory on load', async () => {
  await load([priya(), lena()]);
  expect($('directory-denied').hidden).toBe(true);
  expect($('directory-authorized').hidden).toBe(false);
  expect(rows()).toHaveLength(2);
});

test('AC2: a non-HR/Manager role is denied and controls are hidden', async () => {
  const api = { list: jest.fn().mockRejectedValue({ status: 403 }) };
  initEmployeeDirectoryApp(document, api, () => 'employee');
  await flush();
  expect($('directory-authorized').hidden).toBe(true);
  expect($('directory-denied').hidden).toBe(false);
  expect($('directory-denied-text').textContent).toMatch(/need the HR or Manager role/i);
});

test('AC2: signed out sees the "must be signed in" copy', async () => {
  const api = { list: jest.fn().mockRejectedValue({ status: 401 }) };
  initEmployeeDirectoryApp(document, api, () => 'signedout');
  await flush();
  expect($('directory-denied-text').textContent).toMatch(/must be signed in/i);
});

test('AC2: switching role back to HR re-fetches and restores the directory', async () => {
  const api = { list: jest.fn().mockRejectedValueOnce({ status: 403 }).mockResolvedValue([priya()]) };
  initEmployeeDirectoryApp(document, api, () => 'hr');
  await flush();
  expect($('directory-authorized').hidden).toBe(true);
  $('role-select').dispatchEvent(new Event('change'));
  await flush();
  expect(api.list).toHaveBeenCalledTimes(2);
  expect($('directory-authorized').hidden).toBe(false);
  expect(rows()).toHaveLength(1);
});

test('AC3: name search narrows results, department narrows further', async () => {
  await load([priya(), lena(), sofiaOps(), sofiaMarketing()]);
  type('search-input', 'Sofia Russo');
  expect(rows()).toHaveLength(2);
  type('department-filter', 'Marketing', 'change');
  expect(rows()).toHaveLength(1);
});

test('AC3: role filter and populated options', async () => {
  await load([priya(), lena(), noahSales()]);
  const depts = [...$('department-filter').options].map((o) => o.value);
  expect(depts).toEqual(['all', 'Finance', 'Sales']);
  type('role-filter', 'Sales Manager', 'change');
  expect(rows()).toHaveLength(1);
});

test('AC3 edge: accented, punctuated name matches a plain substring', async () => {
  await load([siobhan()]);
  type('search-input', "o'connor");
  expect(rows()).toHaveLength(1);
});

test('AC3 edge: more than 8 matches shows only 8 plus a partial note', async () => {
  const many = Array.from({ length: 10 }, (_, i) => emp(`emp_x${i}`, `Person ${i}`, 'Sales', 'Rep'));
  await load(many);
  expect(rows()).toHaveLength(8);
  expect($('partial-note').hidden).toBe(false);
  expect($('results-summary').textContent).toBe('Showing 8 of 10 matching employees');
});

test('AC4: no-match shows empty state; Clear filters restores rows', async () => {
  await load([sofiaMarketing(), noahSales()]);
  type('department-filter', 'Marketing', 'change');
  type('role-filter', 'Sales Manager', 'change');
  expect(rows()).toHaveLength(0);
  expect(document.querySelector('.empty-state').textContent).toMatch(/No employees match/i);
  document.getElementById('empty-clear-btn').click();
  expect(rows()).toHaveLength(2);
  type('search-input', 'zzz');
  $('clear-filters-btn').click();
  expect(rows()).toHaveLength(2);
});

test('AC5: deactivated employee appears with Inactive badge and is searchable', async () => {
  await load([lena()]);
  expect(document.querySelector('.status-chip--inactive').textContent).toContain('Inactive');
  type('search-input', 'Lena Voss');
  expect(rows()).toHaveLength(1);
});

test('AC6: no status filter control; note explains why', async () => {
  await load([]);
  expect($('status-filter')).toBeNull();
  expect(document.querySelector('.filter-note').textContent).toMatch(/isn't offered as a filter/i);
});

test('AC7: lookup validates blank/unknown and opens a deactivated ID', async () => {
  const onView = jest.fn();
  await load([lena()], 'hr', onView);
  $('lookup-id-btn').click();
  expect($('lookup-id-error').hidden).toBe(false);
  expect($('lookup-id-error').textContent).toMatch(/Enter an employee ID/);
  $('lookup-id-input').value = 'emp_c999';
  $('lookup-id-btn').click();
  expect($('lookup-id-error').textContent).toMatch(/No employee found/);
  expect(onView).not.toHaveBeenCalled();
  $('lookup-id-input').value = ` ${lena().id.toUpperCase()} `;
  $('lookup-id-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(onView).toHaveBeenCalledWith(lena().id);
});

test('AC8: clicking a name link opens that record', async () => {
  const onView = jest.fn();
  await load([priya()], 'manager', onView);
  document.querySelector('[data-view-id]').click();
  expect(onView).toHaveBeenCalledWith(priya().id);
});

test('error state: other failures show Retry and keep filters', async () => {
  const api = { list: jest.fn().mockRejectedValueOnce({ status: 500 }).mockResolvedValue([priya()]) };
  initEmployeeDirectoryApp(document, api, () => 'hr');
  await flush();
  expect($('directory-authorized').hidden).toBe(false);
  expect(document.querySelector('.error-state').textContent).toContain('Something went wrong');
  document.getElementById('retry-search-btn').click();
  await flush();
  expect(rows()).toHaveLength(1);
});
