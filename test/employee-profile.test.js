/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'employee-profile.html');

function fixtureEmployee() {
  return { id: 'emp_2031', name: 'Jordan Reyes', email: 'jordan.reyes@example.com', department: 'Engineering', role: 'Software Engineer II', startDate: '2026-09-20', employmentStatus: 'active' };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function start(api, role) {
  const { initEmployeeProfileApp } = require('../public/js/employee-profile');
  initEmployeeProfileApp(document, 'emp_2031', api, () => role);
}

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC1: HR sees all six fields plus the locked employee ID line', async () => {
  start({ getProfile: () => Promise.resolve(fixtureEmployee()) }, 'hr');
  await flush();
  const text = document.getElementById('profile-area').textContent;
  ['Jordan Reyes', 'jordan.reyes@example.com', 'Engineering', 'Software Engineer II', '09/20/2026', 'Active', 'emp_2031'].forEach((v) => expect(text).toContain(v));
});

test('AC2: a Team member never sees profile fields — a permission-denied panel renders instead', async () => {
  start({ getProfile: () => Promise.reject({ status: 403, error: 'forbidden' }) }, 'team_member');
  await flush();
  const text = document.getElementById('profile-area').textContent;
  expect(text).toContain("don't have permission");
  expect(text).not.toContain('jordan.reyes@example.com');
});

test('AC3: editing and saving updates the displayed profile with the new value', async () => {
  const updated = { ...fixtureEmployee(), role: 'Senior Software Engineer' };
  start({ getProfile: () => Promise.resolve(fixtureEmployee()), updateProfile: () => Promise.resolve(updated) }, 'hr');
  await flush();
  document.getElementById('edit-profile-btn').click();
  document.getElementById('field-role').value = 'Senior Software Engineer';
  document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(document.getElementById('profile-area').textContent).toContain('Senior Software Engineer');
});

test('AC3: a rejected save shows the error banner and keeps the form open', async () => {
  start({ getProfile: () => Promise.resolve(fixtureEmployee()), updateProfile: () => Promise.reject({ status: 500 }) }, 'hr');
  await flush();
  document.getElementById('edit-profile-btn').click();
  document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(document.getElementById('save-error-banner').hidden).toBe(false);
  expect(document.getElementById('modal-wrap').hidden).toBe(false);
});

test('AC3: invalid email blocks the save', async () => {
  const updateProfile = jest.fn();
  start({ getProfile: () => Promise.resolve(fixtureEmployee()), updateProfile }, 'hr');
  await flush();
  document.getElementById('edit-profile-btn').click();
  document.getElementById('field-email').value = 'not-an-email';
  document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  expect(updateProfile).not.toHaveBeenCalled();
  expect(document.getElementById('error-email').hidden).toBe(false);
});

test('AC4: a Team member cannot submit a profile update — updateProfile is never called', async () => {
  const updateProfile = jest.fn();
  start({ getProfile: () => Promise.reject({ status: 403 }), updateProfile }, 'team_member');
  await flush();
  document.getElementById('edit-profile-btn').click();
  expect(document.getElementById('form-deny-notice').hidden).toBe(false);
  expect(document.getElementById('profile-form').hidden).toBe(true);
  expect(updateProfile).not.toHaveBeenCalled();
});

test('AC5: the Employee ID field is readonly and never appears in the save payload', async () => {
  let sentPayload;
  const api = {
    getProfile: () => Promise.resolve(fixtureEmployee()),
    updateProfile: (changes) => { sentPayload = changes; return Promise.resolve({ ...fixtureEmployee(), ...changes }); },
  };
  start(api, 'hr');
  await flush();
  document.getElementById('edit-profile-btn').click();
  expect(document.getElementById('field-employee-id').readOnly).toBe(true);
  document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(sentPayload.id).toBeUndefined();
  expect(sentPayload.employeeId).toBeUndefined();
});
