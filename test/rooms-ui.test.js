/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'rooms.html');

function fixtureRoom(overrides) {
  return Object.assign({
    id: 'RM-402',
    number: '402',
    type: 'Deluxe',
    status: 'available',
    active: true,
    createdAt: '2024-11-05T09:00:00.000Z',
    reservations: [],
  }, overrides);
}

describe('Room Inventory UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC5: an inventory with zero rooms ever created shows the "No rooms yet" prompt', () => {
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], {});
    expect(document.getElementById('rooms-empty-created').hidden).toBe(false);
    expect(document.getElementById('rooms-empty-created').textContent).toContain('Create the first room');
  });

  test('AC3: a deactivated room is excluded from the default (active-only) rendered list', () => {
    const room = fixtureRoom({ active: false, deactivatedAt: '2026-07-15T13:30:00.000Z' });
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], {});
    expect(document.getElementById('rooms-tbody').textContent).not.toContain('402');
  });

  test('AC4: the deactivated room record is retained and visible via "Show inactive rooms"', () => {
    const room = fixtureRoom({ active: false, deactivatedAt: '2026-07-15T13:30:00.000Z' });
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], {});
    const toggle = document.getElementById('show-inactive-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(document.getElementById('rooms-tbody').textContent).toContain('402');
  });

  test('AC1 UI: creating a room with a valid number, type, and status calls the api and appears in the list', async () => {
    const created = fixtureRoom({ id: 'RM-220', number: '220', type: 'Suite', status: 'available' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-number').value = '220';
    document.getElementById('field-type').value = 'Suite';
    document.getElementById('field-status').value = 'available';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.create).toHaveBeenCalledWith({ number: '220', type: 'Suite', status: 'available' });
    expect(document.getElementById('rooms-tbody').textContent).toContain('220');
  });

  test('AC1 UI: a missing room number shows the inline error and does not call the api', () => {
    const api = { create: jest.fn() };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-type').value = 'Suite';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-number').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC2 UI: editing a room saves the new number, type, and status', async () => {
    const room = fixtureRoom({ id: 'RM-205', number: '205', type: 'Deluxe', status: 'available', reservations: [] });
    const updated = { ...room, number: '206', type: 'Suite', status: 'occupied' };
    const api = { update: jest.fn().mockResolvedValue(updated) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], api);
    document.querySelector('[data-edit="RM-205"]').click();
    document.getElementById('edit-number').value = '206';
    document.getElementById('edit-type').value = 'Suite';
    document.getElementById('edit-status').value = 'occupied';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.update).toHaveBeenCalledWith('RM-205', { number: '206', type: 'Suite', status: 'occupied' });
    expect(document.getElementById('rooms-tbody').textContent).toContain('206');
  });

  test('AC8/AC9 UI: choosing maintenance for a room with an active reservation is blocked inline and does not call the api', () => {
    const room = fixtureRoom({
      id: 'RM-102',
      number: '102',
      type: 'Standard',
      status: 'occupied',
      reservations: [{ id: 'RES-1', state: 'checked_in', guest: 'Maria Alvarez', dates: 'Sep 28 – Sep 30, 2026' }],
    });
    const api = { update: jest.fn() };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], api);
    document.querySelector('[data-edit="RM-102"]').click();
    document.getElementById('edit-status').value = 'maintenance';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('edit-block-note').hidden).toBe(false);
    expect(document.getElementById('edit-block-copy').textContent).toMatch(/resolve.*conflicting reservation/i);
    expect(api.update).not.toHaveBeenCalled();
  });

  test('AC8/AC9 UI: a server-side maintenance_blocked response populates the block note even if the client check passed', async () => {
    const room = fixtureRoom({ id: 'RM-118', number: '118', type: 'Standard', status: 'available', reservations: [] });
    const api = { update: jest.fn().mockRejectedValue({ status: 409, body: { error: 'maintenance_blocked', message: "Can't move Room 118 to Maintenance — it has 1 booked reservation (Daniel Kim, Oct 3 – Oct 5, 2026). Resolve or reassign the conflicting reservation first." } }) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], api);
    document.querySelector('[data-edit="RM-118"]').click();
    document.getElementById('edit-status').value = 'maintenance';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.update).toHaveBeenCalled();
    expect(document.getElementById('edit-block-note').hidden).toBe(false);
    expect(document.getElementById('edit-block-copy').textContent).toContain('Resolve or reassign the conflicting reservation');
  });

  test('AC3/AC4 UI: deactivating a room through the confirm modal moves it out of the active list', async () => {
    const room = fixtureRoom({ id: 'RM-402', number: '402', status: 'available' });
    const deactivated = { ...room, active: false, deactivatedAt: '2026-09-29T00:00:00.000Z' };
    const api = { deactivate: jest.fn().mockResolvedValue(deactivated) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], api);
    document.querySelector('[data-deactivate="RM-402"]').click();
    document.getElementById('deactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.deactivate).toHaveBeenCalledWith('RM-402');
    expect(document.getElementById('rooms-tbody').textContent).not.toContain('402');
  });

  test('AC6/AC7 UI: switching the role-select to housekeeping shows the denied panel and hides front-desk content', async () => {
    const api = { list: jest.fn().mockRejectedValue({ status: 403, body: { error: 'forbidden', message: "You don't have permission to view the room inventory" } }) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], api);
    document.getElementById('role-select').value = 'housekeeping';
    document.getElementById('role-select').dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('denied-panel').hidden).toBe(false);
    expect(document.getElementById('front-desk-content').hidden).toBe(true);
    expect(document.getElementById('denied-title').textContent).toBe("You don't have permission to view the room inventory");
  });

  test('AC6/AC7 UI: the denied-tabs preview the create/update/deactivate denial copy', () => {
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], {});
    document.querySelector('[data-denied-action="create"]').click();
    expect(document.getElementById('denied-title').textContent).toBe("You don't have permission to create rooms");
  });
});
