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
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([]) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-name').textContent).toBe(guest.name);
  });

  test('AC3 UI: opening a profile displays the full record', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue({ ...guest, phone: '555-9999' }), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), deactivate: jest.fn().mockResolvedValue(deactivated), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockResolvedValue(reactivated), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue(updated), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockRejectedValue(new Error('network error')), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), deactivate: jest.fn().mockRejectedValue(new Error('network error')), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockRejectedValue(new Error('network error')), getStayHistory: jest.fn().mockResolvedValue([]) };
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
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([]) };
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

  test('AC1: a loading indicator is shown while stay history is being fetched', async () => {
    const guest = fixtureGuest();
    let resolveStayHistory;
    const api = {
      get: jest.fn().mockResolvedValue(guest),
      getStayHistory: jest.fn(() => new Promise((resolve) => { resolveStayHistory = resolve; })),
    };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('stay-history-region').textContent).toContain('Loading stay history');
    resolveStayHistory([]);
  });

  test('AC2/AC3: an unavailable dependency shows a scoped error while the rest of the profile stays usable', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockRejectedValue({ status: 502 }) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('stay-history-region').textContent).toContain('Stay history unavailable');
    expect(document.getElementById('kv-list').textContent).toContain(guest.email);
    document.getElementById('edit-profile-btn').click();
    expect(document.getElementById('details-edit-mode').hidden).toBe(false);
  });

  test('AC4: a guest with no past stays shows the "No stay history yet" placeholder', async () => {
    const guest = fixtureGuest();
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([]) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('stay-history-region').textContent).toContain('No stay history yet');
  });

  test('security: the populated stay history table escapes untrusted field values (e.g. nights)', async () => {
    const guest = fixtureGuest();
    const maliciousStay = {
      id: 'STY-1',
      dates: 'Jun 12–15, 2026',
      room: 'Oceanview Suite',
      nights: '<img src=x onerror=alert(1)>',
      confirmation: 'RES-1',
    };
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([maliciousStay]) };
    const { initGuestProfilesApp } = require('../public/js/guest-profiles');
    initGuestProfilesApp(document, [guest], api);
    document.getElementById('lookup-input').value = guest.id;
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const region = document.getElementById('stay-history-region');
    expect(region.querySelector('img')).toBeNull();
    expect(region.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('createDefaultApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('get() sends the x-staff-role header', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'gst_1' }) });
    const { createDefaultApi } = require('../public/js/guest-profiles');
    await createDefaultApi().get('gst_1');
    expect(global.fetch).toHaveBeenCalledWith(
      '/guests/gst_1',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'front_desk' }) })
    );
  });

  test('getStayHistory() sends the x-staff-role header and resolves the stays array from the response body', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ stays: [{ id: 'stay_1' }] }) });
    const { createDefaultApi } = require('../public/js/guest-profiles');
    const result = await createDefaultApi().getStayHistory('gst_1');
    expect(global.fetch).toHaveBeenCalledWith(
      '/guests/gst_1/stay-history',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'front_desk' }) })
    );
    expect(result).toEqual([{ id: 'stay_1' }]);
  });
});
