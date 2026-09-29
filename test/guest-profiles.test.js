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

  test('AC1 UI: the default directory listing excludes deactivated guests', () => {
    const active = fixtureGuest();
    const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [active, deactivated], {});
    expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
    expect(document.getElementById('guest-tbody').textContent).toContain(active.name);
  });

  test('AC2 UI: searching by a name that matches both an active and a deactivated guest excludes the deactivated one', () => {
    const active = { ...fixtureGuest(), id: 'GST-2002', name: 'Daniel Kim' };
    const deactivated = { ...fixtureGuest(), id: 'GST-2005', name: 'Elena Kim', status: 'deactivated' };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [active, deactivated], {});
    document.getElementById('search-input').value = 'Kim';
    document.getElementById('search-input').dispatchEvent(new Event('input'));
    expect(document.getElementById('guest-tbody').textContent).toContain('Daniel Kim');
    expect(document.getElementById('guest-tbody').textContent).not.toContain('Elena Kim');
  });

  test('AC2 UI: searching a term that only matches a deactivated guest shows the empty state, not that guest', () => {
    const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', email: 'wei.zhang@example.com', status: 'deactivated' };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [deactivated], {});
    document.getElementById('search-input').value = 'wei.zhang';
    document.getElementById('search-input').dispatchEvent(new Event('input'));
    expect(document.getElementById('directory-empty').hidden).toBe(false);
    expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
  });

  test('AC1 UI: Refresh directory re-fetches from the backend and drops a guest deactivated since the last load', async () => {
    const staleActive = { ...fixtureGuest(), id: 'GST-2001', name: 'Maria Alvarez' };
    const api = { list: jest.fn().mockResolvedValue([]) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [staleActive], api);
    expect(document.getElementById('guest-tbody').textContent).toContain('Maria Alvarez');
    document.getElementById('refresh-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.list).toHaveBeenCalled();
    expect(document.getElementById('directory-empty').hidden).toBe(false);
  });

  test('AC3 UI: looking up a deactivated guest by ID still opens its full profile', async () => {
    const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);
    document.getElementById('lookup-input').value = deactivatedGuest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-name').textContent).toBe(deactivatedGuest.name);
    expect(document.getElementById('deactivated-banner').hidden).toBe(false);
  });

  test('reactivating a guest reached via ID lookup adds it back into the directory listing', async () => {
    const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
    const reactivated = { ...deactivatedGuest, status: 'active' };
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockResolvedValue(reactivated) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [], api);
    document.getElementById('lookup-input').value = deactivatedGuest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('reactivate-profile-btn').click();
    document.getElementById('reactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('profile-back-btn').click();
    expect(document.getElementById('guest-tbody').textContent).toContain(reactivated.name);
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
