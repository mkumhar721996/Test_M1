/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-profiles.html');

const $ = (id) => document.getElementById(id);
const submit = () => $('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fillRequired(overrides = {}) {
  const v = { email: 'jamie@example.com', phone: '555-0100', name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01', ...overrides };
  $('field-name').value = v.name;
  $('field-department').value = v.department;
  $('field-role').value = v.role;
  $('field-start-date').value = v.startDate;
  $('field-email').value = v.email;
  $('field-phone').value = v.phone;
}

beforeEach(() => {
  jest.resetModules();
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
});

test('AC1: creating a profile with all required fields adds it to the table', async () => {
  const created = { id: 'hire_900', name: 'Jamie Lee', email: '', phone: '', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01', hireStage: 'draft' };
  const api = { create: jest.fn().mockResolvedValue(created) };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [], api);
  $('new-profile-btn').click();
  fillRequired();
  submit();
  await flush();
  expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' }));
  expect($('profile-tbody').textContent).toContain('Jamie Lee');
  expect($('modal-wrap').hidden).toBe(true);
});

test('AC2: editing a profile updates the row in place', async () => {
  const existing = { id: 'hire_3112', name: 'Devon Ruiz', email: 'devon.ruiz@example.com', phone: '555-0100', department: 'Engineering', role: 'IT Support Specialist', startDate: '2026-10-20', hireStage: 'offer_accepted' };
  const updated = { ...existing, phone: '555-1212', department: 'Product', role: 'Product Analyst', startDate: '2026-11-01', hireStage: 'onboarding_in_progress' };
  const api = { update: jest.fn().mockResolvedValue(updated) };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [existing], api);
  document.querySelector('[data-edit-id="hire_3112"]').click();
  expect($('field-email').value).toBe('devon.ruiz@example.com');
  $('field-phone').value = '555-1212';
  $('field-department').value = 'Product';
  $('field-role').value = 'Product Analyst';
  $('field-start-date').value = '2026-11-01';
  $('field-hire-stage').value = 'onboarding_in_progress';
  submit();
  await flush();
  expect(api.update).toHaveBeenCalledWith('hire_3112', expect.objectContaining({ phone: '555-1212', department: 'Product', role: 'Product Analyst', startDate: '2026-11-01', hireStage: 'onboarding_in_progress' }));
  expect($('profile-tbody').textContent).toContain('Product Analyst');
});

test.each([
  ['field-name', 'error-name', 'Full name is required.'],
  ['field-email', 'error-email', 'Email is required.'],
  ['field-phone', 'error-phone', 'Phone is required.'],
  ['field-department', 'error-department', 'Department is required.'],
  ['field-role', 'error-role', 'Role is required.'],
  ['field-start-date', 'error-start-date', 'Start date is required.'],
])('AC3/AC4: leaving %s blank blocks the save and shows its own error', (fieldId, errorId, message) => {
  const api = { create: jest.fn() };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [], api);
  $('new-profile-btn').click();
  fillRequired();
  $(fieldId).value = '';
  submit();
  expect($(errorId).hidden).toBe(false);
  expect($(errorId).textContent).toContain(message);
  expect(api.create).not.toHaveBeenCalled();
  expect($('modal-wrap').hidden).toBe(false);
});

test('AC3/AC4: a server-side rejection keeps the table unchanged and shows an error toast', async () => {
  const api = { create: jest.fn().mockRejectedValue({ status: 400, fields: { name: 'Full name is required.' } }) };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [], api);
  $('new-profile-btn').click();
  fillRequired();
  submit();
  await flush();
  expect($('profile-tbody').textContent).not.toContain('Jamie Lee');
  expect($('toast-message').textContent).toContain('Could not save');
  expect($('modal-wrap').hidden).toBe(false);
});

test('AC5: a profile with every required field present creates successfully', async () => {
  const created = { id: 'hire_901', name: 'Robin Tran', email: 'robin@example.com', phone: '555-0100', department: 'Finance', role: 'Analyst', startDate: '2026-12-10', hireStage: 'draft' };
  const api = { create: jest.fn().mockResolvedValue(created) };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [], api);
  $('new-profile-btn').click();
  fillRequired({ name: 'Robin Tran', department: 'Finance', role: 'Analyst', startDate: '2026-12-10' });
  submit();
  await flush();
  expect(api.create).toHaveBeenCalled();
  expect($('toast-message').textContent).toBe('Profile created');
});

test('AC6: "Create rehire profile" pre-fills name/department/role, resets start date and stage, and saves a standalone record', async () => {
  const prior = { id: 'hire_3101', name: 'Sam Okafor', email: 'sam.okafor@example.com', phone: '', department: 'Sales', role: 'Account Executive', startDate: '2025-03-10', hireStage: 'completed' };
  const created = { id: 'hire_3140', name: 'Sam Okafor', email: '', phone: '', department: 'Product', role: 'Senior Product Manager', startDate: '2026-11-16', hireStage: 'draft' };
  const api = { create: jest.fn().mockResolvedValue(created) };
  const { initHireProfilesApp } = require('../public/js/hire-profiles');
  initHireProfilesApp(document, [prior], api);
  document.querySelector('[data-rehire-id="hire_3101"]').click();
  expect($('field-name').value).toBe('Sam Okafor');
  expect($('field-start-date').value).toBe('');
  expect($('field-hire-stage').value).toBe('draft');
  expect($('rehire-banner').hidden).toBe(false);
  $('field-department').value = 'Product';
  $('field-role').value = 'Senior Product Manager';
  $('field-start-date').value = '2026-11-16';
  $('field-email').value = 'sam.okafor@example.com';
  $('field-phone').value = '555-0100';
  submit();
  await flush();
  const [sentPayload] = api.create.mock.calls[0];
  expect(sentPayload).not.toHaveProperty('priorProfileId');
  const rows = $('profile-tbody').textContent;
  expect(rows).toContain('hire_3101');
  expect(rows).toContain('hire_3140');
});

describe('createDefaultApi', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test('create() sends the x-staff-role header', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'hire_1' }) });
    const { createDefaultApi } = require('../public/js/hire-profiles');
    await createDefaultApi().create({ name: 'A' });
    expect(global.fetch).toHaveBeenCalledWith('/hires', expect.objectContaining({
      headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
    }));
  });

  test('update() sends the x-staff-role header (manager acts as hr)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'hire_1' }) });
    const { createDefaultApi } = require('../public/js/hire-profiles');
    await createDefaultApi().update('hire_1', { name: 'A' });
    expect(global.fetch).toHaveBeenCalledWith('/hires/hire_1', expect.objectContaining({
      headers: expect.objectContaining({ 'x-staff-role': 'hr' }),
    }));
  });
});
