/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-profile.html');

function fixtureHire() {
  return {
    id: 'hire_2031',
    name: 'Jordan Reyes',
    email: 'jordan.reyes@example.com',
    phone: '(312) 555-0148',
    startDate: '2026-10-05',
    department: 'Engineering',
    role: 'Software Engineer II',
    hireStage: 'offer_accepted',
    profileStatus: 'active',
    run: { id: 'run_7241', status: 'active', department: 'Engineering', role: 'Software Engineer II', startedAt: '09/23/2026 08:00', tasksDone: 2 },
    runHistory: [],
  };
}

describe('Hire Profile — AC9 pending state', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC9: confirming a role/department change shows a pending state and locks the profile until it resolves', async () => {
    let resolveUpdate;
    const api = { updateRoleDepartment: () => new Promise((resolve) => { resolveUpdate = resolve; }) };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, fixtureHire(), api);

    document.getElementById('edit-role-btn').click();
    document.getElementById('field-department').value = 'Product';
    document.getElementById('field-role').value = 'Product Manager';
    document.getElementById('role-form').dispatchEvent(new Event('submit', { cancelable: true }));
    document.getElementById('role-confirm-btn').click();

    expect(document.getElementById('pending-banner').hidden).toBe(false);
    expect(document.getElementById('profile-fieldset').disabled).toBe(true);

    resolveUpdate({ ...fixtureHire(), department: 'Product', role: 'Product Manager', run: { id: 'run_9', status: 'active', department: 'Product', role: 'Product Manager', tasksDone: 0 } });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('pending-banner').hidden).toBe(true);
    expect(document.getElementById('profile-fieldset').disabled).toBe(false);
  });

  test('AC9 (contrast case): saving a contact/start-date change never shows the Run pending banner', async () => {
    let resolveUpdate;
    const api = { updateContact: () => new Promise((resolve) => { resolveUpdate = resolve; }) };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, fixtureHire(), api);

    document.getElementById('edit-contact-btn').click();
    document.getElementById('contact-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(document.getElementById('pending-banner').hidden).toBe(true);
    resolveUpdate(fixtureHire());
    await Promise.resolve();
    await Promise.resolve();
  });

  test('AC1/AC9: saving hire stage to offer-accepted shows the pending banner while triggering, then clears it', async () => {
    let resolveSave;
    const api = { saveStage: () => new Promise((resolve) => { resolveSave = resolve; }) };
    const draftHire = { ...fixtureHire(), hireStage: 'draft', run: null };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, draftHire, api);

    document.getElementById('field-hire-stage').value = 'offer_accepted';
    document.getElementById('save-stage-btn').click();

    expect(document.getElementById('pending-banner').hidden).toBe(false);
    expect(document.getElementById('profile-fieldset').disabled).toBe(true);

    resolveSave({ ...draftHire, hireStage: 'offer_accepted', run: { id: 'run_1', status: 'active', department: 'Engineering', role: 'Software Engineer II', tasksDone: 0 } });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('pending-banner').hidden).toBe(true);
    expect(document.getElementById('profile-fieldset').disabled).toBe(false);
  });

  test('AC6/AC9: deactivating shows the pending banner until it resolves', async () => {
    let resolveDeactivate;
    const api = { deactivate: () => new Promise((resolve) => { resolveDeactivate = resolve; }) };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, fixtureHire(), api);

    document.getElementById('deactivate-btn').click();
    document.getElementById('deactivate-confirm-btn').click();

    expect(document.getElementById('pending-banner').hidden).toBe(false);

    resolveDeactivate({ ...fixtureHire(), profileStatus: 'deactivated', run: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('pending-banner').hidden).toBe(true);
  });

  test('AC7/AC9: reactivating shows the pending banner until it resolves', async () => {
    let resolveReactivate;
    const api = { reactivate: () => new Promise((resolve) => { resolveReactivate = resolve; }) };
    const deactivatedHire = { ...fixtureHire(), profileStatus: 'deactivated', run: null };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, deactivatedHire, api);

    document.getElementById('reactivate-btn').click();
    document.getElementById('reactivate-confirm-btn').click();

    expect(document.getElementById('pending-banner').hidden).toBe(false);

    resolveReactivate({ ...deactivatedHire, profileStatus: 'active', run: { id: 'run_2', status: 'active', department: 'Engineering', role: 'Software Engineer II', tasksDone: 0, freshStart: true } });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('pending-banner').hidden).toBe(true);
  });
});

describe('createDefaultApi', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test.each(['deactivate', 'reactivate'])('%s() sends the x-staff-role header', async (action) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const { createDefaultApi } = require('../public/js/hire-profile');
    await createDefaultApi('hire_1')[action]();
    expect(global.fetch).toHaveBeenCalledWith(`/hires/hire_1/${action}`, expect.objectContaining({
      headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
    }));
  });

  test('updateContact() sends the x-staff-role header on the PATCH', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const { createDefaultApi } = require('../public/js/hire-profile');
    await createDefaultApi('hire_1').updateContact({ name: 'A' });
    expect(global.fetch).toHaveBeenCalledWith('/hires/hire_1', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
    }));
  });
});

describe('Hire Profile — reject / withdraw outcome', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });
  const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };
  const preOffer = () => ({ ...fixtureHire(), hireStage: 'interview', run: null });

  test('AC1: mark-as-rejected dialog updates the chip and removes reject/withdraw buttons', async () => {
    const api = { reject: jest.fn((reason) => Promise.resolve({ ...preOffer(), profileStatus: 'rejected', outcomeReason: reason })) };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, preOffer(), api);

    document.getElementById('reject-btn').click();
    document.getElementById('outcome-reason').value = ' Not a fit ';
    document.getElementById('outcome-confirm-btn').click();
    await flush();

    expect(api.reject).toHaveBeenCalledWith('Not a fit');
    expect(document.getElementById('profile-status-chip').className).toContain('profile-status-chip--rejected');
    expect(document.getElementById('reject-btn')).toBeNull();
    expect(document.getElementById('withdraw-btn')).toBeNull();
  });

  test.each(['rejected', 'withdrawn'])('AC2: reactivating a %s hire surfaces the server message', async (status) => {
    const message = 'Cannot reactivate — final outcome.';
    const api = { reactivate: jest.fn(() => Promise.reject({ status: 400, fields: { profileStatus: message } })) };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, { ...preOffer(), profileStatus: status }, api);

    document.getElementById('reactivate-btn').click();
    await flush();

    expect(document.getElementById('toast-message').textContent).toBe(message);
    expect(document.getElementById('profile-status-chip').className).toContain(`--${status}`);
  });

  test.each([
    ['active', 'Active profile'],
    ['deactivated', 'Deactivated'],
    ['rejected', 'Rejected'],
    ['withdrawn', 'Withdrawn'],
  ])('AC6: %s status renders its own distinguishable chip', (status, label) => {
    const hire = { ...fixtureHire(), profileStatus: status, run: null };
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, hire, {});
    const chip = document.getElementById('profile-status-chip');
    expect(chip.className).toContain(`profile-status-chip--${status}`);
    expect(chip.textContent).toContain(label);
  });

  test('reject/withdraw are not offered once past the offer stage', () => {
    const { initHireProfileApp } = require('../public/js/hire-profile');
    initHireProfileApp(document, fixtureHire(), {});
    expect(document.getElementById('reject-btn')).toBeNull();
    expect(document.getElementById('withdraw-btn')).toBeNull();
  });
});
