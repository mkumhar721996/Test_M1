/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'rooms.html');

describe('Rooms UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1 UI: creating a room adds it to the rendered list', async () => {
    const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
    const newRoom = { id: 'room_1', identifier: '101', roomTypeId: 'rt_standard_king', status: 'available' };
    const api = { create: jest.fn().mockResolvedValue(newRoom) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], roomTypes, api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-room-identifier').value = '101';
    document.getElementById('field-room-type').value = 'rt_standard_king';
    document.getElementById('create-room-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('room-tbody').textContent).toContain('101');
    expect(document.getElementById('room-tbody').textContent).toContain('Standard King');
  });

  test('AC1 UI (validation): submitting without an identifier shows the inline error and does not call the api', () => {
    const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
    const api = { create: jest.fn() };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], roomTypes, api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-room-type').value = 'rt_standard_king';
    document.getElementById('create-room-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-room-identifier').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC2/AC4 UI: changing the status select updates the rendered room status', async () => {
    const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
    const room = { id: 'room_1', identifier: '101', roomTypeId: 'rt_standard_king', status: 'available' };
    const updated = { ...room, status: 'maintenance' };
    const api = { updateStatus: jest.fn().mockResolvedValue(updated) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], roomTypes, api);
    const select = document.querySelector('.room-status-select');
    select.value = 'maintenance';
    select.dispatchEvent(new Event('change', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.updateStatus).toHaveBeenCalledWith('room_1', 'maintenance');
    expect(document.getElementById('room-tbody').textContent).toContain('Maintenance');
  });

  test('AC5 UI: a duplicate identifier shows the inline error and keeps the modal open', async () => {
    const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
    const api = { create: jest.fn().mockRejectedValue({ status: 400, error: "a room with identifier '101' already exists" }) };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], roomTypes, api);
    document.getElementById('new-room-btn').click();
    document.getElementById('field-room-identifier').value = '101';
    document.getElementById('field-room-type').value = 'rt_standard_king';
    document.getElementById('create-room-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('error-room-identifier').hidden).toBe(false);
    expect(document.getElementById('create-room-modal').hidden).toBe(false);
    expect(document.getElementById('field-room-identifier').value).toBe('101');
    expect(document.getElementById('room-tbody').textContent).not.toContain('101');
  });

  test('AC6: an empty room list shows the empty-state prompt', () => {
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [], [], {});
    expect(document.getElementById('rooms-table-wrap').hidden).toBe(true);
    expect(document.getElementById('rooms-empty').hidden).toBe(false);
    expect(document.getElementById('rooms-empty').textContent.toLowerCase()).toContain('room');
  });

  test('AC6: a non-empty room list hides the empty-state and shows the table', () => {
    const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
    const room = { id: 'room_1', identifier: '101', roomTypeId: 'rt_standard_king', status: 'available' };
    const { initRoomsApp } = require('../public/js/rooms');
    initRoomsApp(document, [room], roomTypes, {});
    expect(document.getElementById('rooms-table-wrap').hidden).toBe(false);
    expect(document.getElementById('rooms-empty').hidden).toBe(true);
  });
});
