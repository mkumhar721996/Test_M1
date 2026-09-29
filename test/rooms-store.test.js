const {
  RoomValidationError,
  RoomMaintenanceBlockedError,
  canManageRooms,
  createRoom,
  getRoom,
  listRooms,
  updateRoom,
  deactivateRoom,
  reactivateRoom,
} = require('../src/rooms/store');

test('AC1: createRoom adds a room with the exact submitted number/type/status', () => {
  const room = createRoom({ number: '220', type: 'Suite', status: 'available' });
  expect(room).toMatchObject({ number: '220', type: 'Suite', status: 'available' });
  expect(listRooms()).toContainEqual(expect.objectContaining({ number: '220', type: 'Suite', status: 'available' }));
});

test('AC1: createRoom rejects a duplicate room number', () => {
  createRoom({ number: '221', type: 'Standard', status: 'available' });
  expect(() => createRoom({ number: '221', type: 'Deluxe', status: 'available' })).toThrow(RoomValidationError);
});

test('AC1: createRoom rejects missing required fields', () => {
  expect(() => createRoom({ number: '', type: 'Standard', status: 'available' })).toThrow(RoomValidationError);
  expect(() => createRoom({ number: '222', type: '', status: 'available' })).toThrow(RoomValidationError);
  expect(() => createRoom({ number: '223', type: 'Standard', status: '' })).toThrow(RoomValidationError);
});

test('AC2: updateRoom reflects new number, type, and status', () => {
  const room = createRoom({ number: '205', type: 'Deluxe', status: 'available' });
  const updated = updateRoom(room.id, { number: '206', type: 'Suite', status: 'occupied' });
  expect(updated).toMatchObject({ number: '206', type: 'Suite', status: 'occupied' });
  expect(getRoom(room.id)).toMatchObject({ number: '206', type: 'Suite', status: 'occupied' });
});

test('AC3/AC4: deactivateRoom marks a room inactive but retains its record', () => {
  const room = createRoom({ number: '402', type: 'Deluxe', status: 'available' });
  const deactivated = deactivateRoom(room.id);
  expect(deactivated.active).toBe(false);
  expect(typeof deactivated.deactivatedAt).toBe('string');
  expect(getRoom(room.id)).toBeTruthy();
  expect(listRooms().some((r) => r.id === room.id)).toBe(true);
});

test('reactivateRoom clears the deactivated state', () => {
  const room = createRoom({ number: '403', type: 'Standard', status: 'available' });
  deactivateRoom(room.id);
  const reactivated = reactivateRoom(room.id);
  expect(reactivated.active).toBe(true);
  expect(reactivated.deactivatedAt).toBeUndefined();
});

test('AC6/AC7: canManageRooms allows front_desk and denies housekeeping and unknown roles', () => {
  expect(canManageRooms('front_desk')).toBe(true);
  expect(canManageRooms('housekeeping')).toBe(false);
  expect(canManageRooms('someone_else')).toBe(false);
  expect(canManageRooms(undefined)).toBe(false);
});

test('AC8/AC9: updateRoom rejects a maintenance transition while any reservation is active, naming the conflict', () => {
  const room = createRoom({
    number: '102',
    type: 'Standard',
    status: 'occupied',
    reservations: [{ id: 'RES-1', state: 'checked_in', guest: 'Maria Alvarez', dates: 'Sep 28 – Sep 30, 2026' }],
  });
  expect(() => updateRoom(room.id, { status: 'maintenance' })).toThrow(RoomMaintenanceBlockedError);
  try {
    updateRoom(room.id, { status: 'maintenance' });
  } catch (err) {
    expect(err.message).toMatch(/resolve.*conflicting reservation/i);
    expect(err.conflictingReservations).toHaveLength(1);
  }
  expect(getRoom(room.id).status).toBe('occupied');
});

test('AC8/AC9: a room with no active reservations can be moved to maintenance', () => {
  const room = createRoom({ number: '310', type: 'Suite', status: 'available' });
  const updated = updateRoom(room.id, { status: 'maintenance' });
  expect(updated.status).toBe('maintenance');
});
