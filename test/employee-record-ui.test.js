/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'employee-record.html');

const priya = () => ({
  id: 'emp_c004', name: 'Priya Nair', email: 'priya@example.com', department: 'Finance', role: 'Financial Analyst', startDate: '2026-02-16', employmentStatus: 'active',
});
const marcus = () => ({ ...priya(), id: 'emp_c003', name: 'Marcus Chen', employmentStatus: 'deactivated' });

let initEmployeeRecordApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initEmployeeRecordApp } = require('../public/js/employee-record'));
});

const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };
const $ = (id) => document.getElementById(id);

test('AC7: renders a deactivated employee in full', async () => {
  const api = { getProfile: jest.fn().mockResolvedValue(marcus()) };
  initEmployeeRecordApp(document, 'emp_c003', api);
  await flush();
  expect(api.getProfile).toHaveBeenCalled();
  expect($('profile-authorized').hidden).toBe(false);
  expect($('profile-status-chip').textContent).toContain('Inactive');
  expect($('profile-name').textContent).toBe('Marcus Chen');
  expect($('profile-start-date').textContent).toBe('02/16/2026');
});

test('AC8: renders full detail for an active employee', async () => {
  const api = { getProfile: jest.fn().mockResolvedValue(priya()) };
  initEmployeeRecordApp(document, priya().id, api);
  await flush();
  expect($('profile-email').textContent).toBe(priya().email);
  expect($('profile-id').textContent).toBe(priya().id);
  expect($('profile-role-line').textContent).toBe('Financial Analyst · Finance');
  expect(document.querySelector('.status-chip--active')).not.toBeNull();
});

test('AC2: 401/403 shows the denied panel and hides the record', async () => {
  const api = { getProfile: jest.fn().mockRejectedValue({ status: 403 }) };
  initEmployeeRecordApp(document, 'emp_c004', api);
  await flush();
  expect($('profile-denied').hidden).toBe(false);
  expect($('profile-authorized').hidden).toBe(true);
});

test('404 shows the not-found state', async () => {
  const api = { getProfile: jest.fn().mockRejectedValue({ status: 404 }) };
  initEmployeeRecordApp(document, 'emp_c999', api);
  await flush();
  expect($('profile-notfound').hidden).toBe(false);
  expect($('profile-authorized').hidden).toBe(true);
});

test('missing id shows not-found without calling the API', async () => {
  const api = { getProfile: jest.fn() };
  initEmployeeRecordApp(document, null, api);
  await flush();
  expect(api.getProfile).not.toHaveBeenCalled();
  expect($('profile-notfound').hidden).toBe(false);
});

test('role change reloads the record', async () => {
  const api = { getProfile: jest.fn().mockRejectedValueOnce({ status: 403 }).mockResolvedValue(priya()) };
  initEmployeeRecordApp(document, 'emp_c004', api);
  await flush();
  $('role-select').dispatchEvent(new Event('change'));
  await flush();
  expect($('profile-denied').hidden).toBe(true);
  expect($('profile-authorized').hidden).toBe(false);
});
