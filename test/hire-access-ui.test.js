/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-access.html');
const hire = () => ({ id: 'hire_2031', name: 'Jordan Reyes', email: 'j@example.com', phone: '1', department: 'Engineering', role: 'SWE', startDate: '2026-10-19', hireStage: 'offer_accepted', hiringManager: 'Dana Brooks', profileStatus: 'active', onboardingStatus: 'in_progress' });
const flush = () => new Promise((r) => setTimeout(r, 0));

let initHireAccessApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initHireAccessApp } = require('../public/js/hire-access'));
});

test('AC8: self view omits pipeline stage and hire id but shows onboarding status', () => {
  initHireAccessApp(document, { role: 'new_hire', hireId: 'hire_2031' }, { allowed: true, hire: hire() });
  const text = document.getElementById('profile-kv-list').textContent;
  expect(text).not.toContain('Pipeline stage');
  expect(text).not.toContain('Hire ID');
  expect(text).toContain('Onboarding status');
});

test('AC1: HR sees the full field set and controls', () => {
  initHireAccessApp(document, { role: 'hr', name: 'Priya Shah' }, { allowed: true, hire: hire() });
  const text = document.getElementById('profile-kv-list').textContent;
  expect(text).toContain('Pipeline stage');
  expect(text).toContain('Hire ID');
  expect(document.getElementById('profile-edit-btn').hidden).toBe(false);
  expect(document.getElementById('profile-lifecycle-btn').hidden).toBe(false);
});

test('manager sees the read-only note and no edit controls', () => {
  initHireAccessApp(document, { role: 'manager', name: 'Dana Brooks' }, { allowed: true, hire: hire() });
  expect(document.getElementById('profile-edit-btn').hidden).toBe(true);
  expect(document.getElementById('profile-lifecycle-btn').hidden).toBe(true);
  expect(document.getElementById('profile-readonly-note').hidden).toBe(false);
});

test.each([
  ['not_direct_report', "isn't one of your direct reports"],
  ['not_own_profile', 'only view your own profile'],
  ['cross_tenant', 'different tenant'],
])('AC10: denied state shows reason %s', (reason, text) => {
  initHireAccessApp(document, { role: 'manager', name: 'Dana Brooks', tenant: 'Acme Corp' }, { allowed: false, reason });
  expect(document.getElementById('profile-denied-state').hidden).toBe(false);
  expect(document.getElementById('profile-viewable-state').hidden).toBe(true);
  expect(document.getElementById('denied-reason').textContent).toContain(text);
});

test('AC2: HR edit submits PATCH via api and re-renders', async () => {
  const update = jest.fn().mockResolvedValue({ ...hire(), department: 'Product' });
  initHireAccessApp(document, { role: 'hr' }, { allowed: true, hire: hire() }, { update });
  document.getElementById('profile-edit-btn').click();
  document.getElementById('field-department').value = 'Product';
  document.getElementById('edit-save-btn').click();
  await flush();
  expect(update).toHaveBeenCalledWith('hire_2031', expect.objectContaining({ department: 'Product' }));
  expect(document.getElementById('profile-kv-list').textContent).toContain('Product');
  expect(document.getElementById('toast-message').textContent).toBe('Profile updated');
});

test('edit with a blank required field does not call the api', () => {
  const update = jest.fn();
  initHireAccessApp(document, { role: 'hr' }, { allowed: true, hire: hire() }, { update });
  document.getElementById('profile-edit-btn').click();
  document.getElementById('field-name').value = '';
  document.getElementById('edit-save-btn').click();
  expect(update).not.toHaveBeenCalled();
  expect(document.getElementById('error-name').classList.contains('is-visible')).toBe(true);
});

test('AC3: HR deactivate confirms then shows deactivated', async () => {
  const deactivate = jest.fn().mockResolvedValue({ ...hire(), profileStatus: 'deactivated' });
  initHireAccessApp(document, { role: 'hr' }, { allowed: true, hire: hire() }, { deactivate });
  document.getElementById('profile-lifecycle-btn').click();
  document.getElementById('confirm-action-btn').click();
  await flush();
  expect(deactivate).toHaveBeenCalledWith('hire_2031');
  expect(document.getElementById('profile-status-chip').textContent).toContain('Deactivated');
  expect(document.getElementById('profile-lifecycle-btn').textContent).toBe('Reactivate profile');
  expect(document.getElementById('toast-message').textContent).toBe('Profile deactivated');
});
