test('AC1: createRoom assigns to an existing room type and appears in listRooms', () => {
  const { createRoom, listRoomTypes, listRooms } = require('../src/rooms/store');
  const roomTypeId = listRoomTypes()[0].id;
  const room = createRoom({ identifier: '101', roomTypeId });
  expect(room.roomTypeId).toBe(roomTypeId);
  expect(listRooms().find((r) => r.id === room.id)).toMatchObject({ identifier: '101', roomTypeId, status: 'available' });
});

test('AC2: a maintenance room is reported as not bookable', () => {
  const { createRoom, listRoomTypes, updateRoomStatus, checkRoomBookable } = require('../src/rooms/store');
  const room = createRoom({ identifier: '102', roomTypeId: listRoomTypes()[0].id });
  updateRoomStatus(room.id, 'maintenance');
  expect(checkRoomBookable(room.id)).toMatchObject({ bookable: false });
});

test('AC5: createRoom rejects a duplicate identifier and creates nothing', () => {
  const { createRoom, listRoomTypes, listRooms, RoomValidationError } = require('../src/rooms/store');
  const roomTypeId = listRoomTypes()[0].id;
  createRoom({ identifier: 'DUP-1', roomTypeId });
  const before = listRooms().length;
  expect(() => createRoom({ identifier: 'DUP-1', roomTypeId })).toThrow(RoomValidationError);
  expect(listRooms().length).toBe(before);
});
