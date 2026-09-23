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
