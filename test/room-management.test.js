/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'room-management.html');

describe('Room Management UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1 UI: creating a room adds it under its room type heading', async () => {
    const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
    const api = { create: jest.fn().mockResolvedValue({ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }) };
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, roomTypes, [], api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-identifier').value = '305';
    document.getElementById('field-room-type').value = 'rt_standard';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    const group = document.querySelector('[data-room-type-id="rt_standard"]');
    expect(group.textContent).toContain('305');
  });

  test('AC2/AC4 UI: changing the status select calls the api and re-renders the new status', async () => {
    const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
    const rooms = [{ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }];
    const api = { updateStatus: jest.fn().mockResolvedValue({ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'maintenance' }) };
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, roomTypes, rooms, api);
    const select = document.querySelector('.room-status-select[data-id="room_1"]');
    select.value = 'maintenance';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();
    expect(api.updateStatus).toHaveBeenCalledWith('room_1', 'maintenance');
    expect(document.querySelector('.room-status-select[data-id="room_1"]').value).toBe('maintenance');
  });

  test('AC2/AC4 UI: a failed status change reverts the select and shows an error toast', async () => {
    const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
    const rooms = [{ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }];
    const api = { updateStatus: jest.fn().mockRejectedValue({ status: 500 }) };
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, roomTypes, rooms, api);
    const select = document.querySelector('.room-status-select[data-id="room_1"]');
    select.value = 'maintenance';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.room-status-select[data-id="room_1"]').value).toBe('available');
    expect(document.getElementById('toast').hidden).toBe(false);
  });

  test('AC5 UI: a duplicate identifier shows an inline error and adds no row', async () => {
    const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
    const existing = [{ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }];
    const api = { create: jest.fn().mockRejectedValue({ status: 400, fields: { identifier: 'Room 305 already exists. Choose a different identifier.' } }) };
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, roomTypes, existing, api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-identifier').value = '305';
    document.getElementById('field-room-type').value = 'rt_standard';
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('error-identifier').hidden).toBe(false);
    expect(document.querySelectorAll('[data-room-id="room_1"]').length).toBe(1);
  });

  test('AC1 UI: submitting with no identifier or room type shows inline errors and does not call the api', () => {
    const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
    const api = { create: jest.fn() };
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, roomTypes, [], api);
    document.getElementById('new-room-btn').click();
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-identifier').hidden).toBe(false);
    expect(document.getElementById('error-room-type').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC6 UI: an empty room list shows an empty-state prompting staff to add a room', () => {
    const { initRoomManagementApp } = require('../public/js/room-management');
    initRoomManagementApp(document, [{ id: 'rt_standard', name: 'Standard Queen' }], [], {});
    expect(document.getElementById('room-list-empty').hidden).toBe(false);
    expect(document.getElementById('room-list-empty').textContent).toMatch(/add a room/i);
  });
});
