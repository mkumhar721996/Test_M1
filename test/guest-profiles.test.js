/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'guest-profiles.html');

function fixtureGuest() {
  return {
    id: 'GST-1001',
    name: 'Maria Alvarez',
    email: 'maria.alvarez@example.com',
    phone: '(555) 214-7788',
    status: 'active',
    createdAt: '2025-11-03T09:12:00.000Z',
    updatedAt: '2026-09-20T14:05:00.000Z',
    preferences: { roomType: 'Ocean view', dietary: 'Vegetarian', communication: 'Email' },
    bookingHistory: [
      { id: 'BK-3081', dates: 'Jun 12–15, 2026', item: 'Oceanview Suite', status: 'Upcoming' },
    ],
    auditLog: [
      { ts: '2025-11-03T09:12:00.000Z', actor: 'Jordan Ruiz', action: 'created profile' },
    ],
  };
}

describe('Guest Profiles UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1 UI: no contact detail shows the inline error and does not call the api', () => {
    const api = { create: jest.fn() };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);
    document.getElementById('new-guest-btn').click();
    document.getElementById('field-name').value = 'Kai Ward';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-contact').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC2 UI: looking up an existing guest by ID opens its profile', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-name').textContent).toBe(guest.name);
  });

  test('AC3 UI: opening a profile displays the full record', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('kv-list').textContent).toContain(guest.email);
    expect(document.getElementById('booking-history').textContent).toContain(guest.bookingHistory[0].item);
  });

  test('AC4 UI: editing only phone sends just the changed field', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue({ ...guest, phone: '555-9999' }) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('edit-profile-btn').click();
    document.getElementById('edit-phone').value = '555-9999';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.update).toHaveBeenCalledWith(guest.id, expect.objectContaining({ phone: '555-9999' }));
    expect(api.update.mock.calls[0][1].name).toBeUndefined();
  });

  test('AC5/AC6 UI: deactivating flips status and keeps booking history visible', async () => {
    const guest = fixtureGuest();
    const deactivated = { ...guest, status: 'deactivated' };
    const api = { get: jest.fn().mockResolvedValue(guest), deactivate: jest.fn().mockResolvedValue(deactivated) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('deactivate-profile-btn').click();
    document.getElementById('deactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('deactivated-banner').hidden).toBe(false);
    expect(document.getElementById('booking-history').textContent).toContain(guest.bookingHistory[0].item);
  });

  test('AC7/AC8 UI: reactivating restores active-profile actions', async () => {
    const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
    const reactivated = { ...deactivatedGuest, status: 'active' };
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockResolvedValue(reactivated) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [deactivatedGuest], api);
    document.getElementById('lookup-input').value = deactivatedGuest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('reactivate-profile-btn').click();
    document.getElementById('reactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('deactivate-profile-btn').hidden).toBe(false);
    expect(document.getElementById('reactivate-profile-btn').hidden).toBe(true);
  });

  test('AC9 UI: a successful edit appends a "Just now" audit entry', async () => {
    const guest = fixtureGuest();
    const updated = { ...guest, phone: '555-9999', auditLog: [...guest.auditLog, { ts: '2026-09-28T09:41:00.000Z', actor: 'Priya Nair', action: 'updated phone' }] };
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue(updated) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('edit-profile-btn').click();
    document.getElementById('edit-phone').value = '555-9999';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('audit-list').textContent).toContain('Priya Nair');
    expect(document.getElementById('audit-list').querySelector('.audit-just-now')).not.toBeNull();
  });

  test('AC10 UI: an unknown ID shows the not-found panel', async () => {
    const api = { get: jest.fn().mockRejectedValue({ status: 404 }) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);
    document.getElementById('lookup-input').value = 'GST-9999';
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('directory-not-found').hidden).toBe(false);
    expect(document.getElementById('directory-not-found').textContent).toContain('GST-9999');
  });

  test('a failed create shows an error toast and does not add the guest to the directory', async () => {
    const api = { create: jest.fn().mockRejectedValue(new Error('network error')) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);
    document.getElementById('new-guest-btn').click();
    document.getElementById('field-name').value = 'Kai Ward';
    document.getElementById('field-email').value = 'kai@example.com';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('guest-tbody').textContent).not.toContain('Kai Ward');
  });

  test('a failed edit shows an error toast and leaves the profile unchanged', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockRejectedValue(new Error('network error')) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('edit-profile-btn').click();
    document.getElementById('edit-phone').value = '555-9999';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-toast').hidden).toBe(false);
    expect(document.getElementById('kv-list').textContent).toContain(guest.phone);
  });

  test('a failed deactivate shows an error toast and leaves the status chip unchanged', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), deactivate: jest.fn().mockRejectedValue(new Error('network error')) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('deactivate-profile-btn').click();
    document.getElementById('deactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-toast').hidden).toBe(false);
    expect(document.getElementById('deactivated-banner').hidden).toBe(true);
  });

  test('a failed reactivate shows an error toast and leaves the status chip unchanged', async () => {
    const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockRejectedValue(new Error('network error')) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [deactivatedGuest], api);
    document.getElementById('lookup-input').value = deactivatedGuest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('reactivate-profile-btn').click();
    document.getElementById('reactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-toast').hidden).toBe(false);
    expect(document.getElementById('deactivated-banner').hidden).toBe(false);
  });

  test('pressing Escape closes an open create/deactivate/reactivate modal', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);

    document.getElementById('new-guest-btn').click();
    expect(document.getElementById('create-modal').hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('create-modal').hidden).toBe(true);

    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    document.getElementById('deactivate-profile-btn').click();
    expect(document.getElementById('deactivate-modal').hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('deactivate-modal').hidden).toBe(true);
  });
});

function fillCreateForm({ name, email, phone }) {
  document.getElementById('field-name').value = name;
  document.getElementById('field-email').value = email || '';
  document.getElementById('field-phone').value = phone || '';
}

describe('Duplicate Guest Detection & Linking', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1: submitting a form whose email matches an existing profile shows the duplicate step and never calls create', async () => {
    const existingGuest = fixtureGuest();
    const checkDuplicates = jest.fn().mockResolvedValue([{ guest: existingGuest, reasons: ['email'] }]);
    const create = jest.fn();
    const api = { checkDuplicates, create };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [existingGuest], api);

    document.getElementById('new-guest-btn').click();
    fillCreateForm({ name: 'Alex Morgan', email: existingGuest.email });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(checkDuplicates).toHaveBeenCalledWith(existingGuest.email, '');
    expect(document.getElementById('step-duplicates').hidden).toBe(false);
    expect(document.querySelector('#dup-cards [data-link-id]')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  test('AC2/AC3: choosing "Link to this profile" never calls create and shows the existing profile as the record to use', async () => {
    const existingGuest = fixtureGuest();
    const checkDuplicates = jest.fn().mockResolvedValue([{ guest: existingGuest, reasons: ['email'] }]);
    const create = jest.fn();
    const api = { checkDuplicates, create };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [existingGuest], api);

    document.getElementById('new-guest-btn').click();
    fillCreateForm({ name: 'Alex Morgan', email: existingGuest.email });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    document.querySelector('#dup-cards [data-link-id]').click();
    await Promise.resolve(); await Promise.resolve();

    expect(create).not.toHaveBeenCalled();
    expect(document.getElementById('create-modal').hidden).toBe(true);
    expect(document.getElementById('profile-name').textContent).toBe(existingGuest.name);
    expect(document.getElementById('profile-screen').hidden).toBe(false);
  });

  test('AC4/AC5: proceeding anyway requires the inline confirmation, then creates a new profile and fully dismisses the duplicate warning', async () => {
    const existingGuest = fixtureGuest();
    const checkDuplicates = jest.fn().mockResolvedValue([{ guest: existingGuest, reasons: ['email'] }]);
    const created = { ...existingGuest, id: 'GST-3003', name: 'New Person' };
    const create = jest.fn().mockResolvedValue(created);
    const api = { checkDuplicates, create };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [existingGuest], api);

    document.getElementById('new-guest-btn').click();
    fillCreateForm({ name: 'New Person', email: existingGuest.email });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    document.getElementById('dup-proceed-btn').click();
    expect(document.getElementById('dup-proceed-confirm').hidden).toBe(false);

    document.getElementById('dup-proceed-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Person', email: existingGuest.email }));
    expect(document.getElementById('create-modal').hidden).toBe(true);
    expect(document.getElementById('step-duplicates').hidden).toBe(true);
  });

  test('AC6/AC7: no matching profiles means no duplicate warning is shown and the profile is created normally', async () => {
    const existingGuest = fixtureGuest();
    const checkDuplicates = jest.fn().mockResolvedValue([]);
    const created = { id: 'GST-4004', name: 'Priya Natarajan', email: 'priya.natarajan@example.com', phone: '', status: 'active', createdAt: '2026-09-28T09:00:00.000Z', updatedAt: '2026-09-28T09:00:00.000Z', preferences: {}, bookingHistory: [], auditLog: [] };
    const create = jest.fn().mockResolvedValue(created);
    const api = { checkDuplicates, create };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [existingGuest], api);

    document.getElementById('new-guest-btn').click();
    fillCreateForm({ name: 'Priya Natarajan', email: 'priya.natarajan@example.com' });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(document.getElementById('step-duplicates').hidden).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(document.getElementById('guest-tbody').textContent).toContain('Priya Natarajan');
  });

  test('a create-form submission still succeeds when the api has no checkDuplicates method (fail-open)', async () => {
    const created = { id: 'GST-5005', name: 'No Check Person', email: 'nocheck@example.com', phone: '', status: 'active', createdAt: '2026-09-28T09:00:00.000Z', updatedAt: '2026-09-28T09:00:00.000Z', preferences: {}, bookingHistory: [], auditLog: [] };
    const create = jest.fn().mockResolvedValue(created);
    const api = { create };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);

    document.getElementById('new-guest-btn').click();
    fillCreateForm({ name: 'No Check Person', email: 'nocheck@example.com' });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(create).toHaveBeenCalledTimes(1);
    expect(document.getElementById('step-duplicates').hidden).toBe(true);
  });
});
