/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-directory.html');

function hire(overrides) {
  return { id: 'hire_1', name: 'Felix Tran', role: 'Data Analyst', department: 'Data', hiringManager: 'Dana Brooks', hireStage: 'screening', profileStatus: 'active', ...overrides };
}

let initHireDirectoryApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initHireDirectoryApp } = require('../public/js/hire-directory'));
});

test('AC5: manager with no direct reports sees the empty state', () => {
  initHireDirectoryApp(document, { role: 'manager', name: 'Elena Vance' }, []);
  expect(document.getElementById('roster-tbody').textContent).toContain("don't have any direct reports yet");
});

test('AC4: manager sees the scope note and rows', () => {
  initHireDirectoryApp(document, { role: 'manager', name: 'Dana Brooks', tenant: 'Acme Corp' }, [hire()]);
  expect(document.getElementById('list-scope-note').hidden).toBe(false);
  expect(document.getElementById('list-scope-note-text').textContent).toContain("Dana Brooks's current direct reports");
  expect(document.querySelectorAll('#roster-tbody tr')).toHaveLength(1);
});

test('AC4/AC9: new hire gets the restricted card, not a table', () => {
  initHireDirectoryApp(document, { role: 'new_hire', name: 'Jordan Reyes', hireId: 'hire_2031' }, []);
  expect(document.getElementById('restricted-card').hidden).toBe(false);
  expect(document.getElementById('roster-wrap').hidden).toBe(true);
});

test('new hire "View my profile" opens their own id', () => {
  const onView = jest.fn();
  initHireDirectoryApp(document, { role: 'new_hire', name: 'Jordan Reyes', hireId: 'hire_2031' }, [], onView);
  document.getElementById('view-own-profile-btn').click();
  expect(onView).toHaveBeenCalledWith('hire_2031');
});

test('HR status filter narrows rows and name click navigates', () => {
  const onView = jest.fn();
  initHireDirectoryApp(document, { role: 'hr', name: 'Priya Shah' }, [hire(), hire({ id: 'hire_2', name: 'Theo', profileStatus: 'deactivated' })], onView);
  const filter = document.getElementById('status-filter');
  filter.value = 'deactivated';
  filter.dispatchEvent(new Event('change'));
  expect(document.querySelectorAll('#roster-tbody tr')).toHaveLength(1);
  expect(document.querySelector('.status-chip--deactivated')).not.toBeNull();
  document.querySelector('[data-view-id]').click();
  expect(onView).toHaveBeenCalledWith('hire_2');
});
