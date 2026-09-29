const crypto = require('crypto');

const rooms = new Map();

const ROOM_TYPES = [
  { id: 'rt_standard', name: 'Standard Queen' },
  { id: 'rt_deluxe', name: 'Deluxe King' },
  { id: 'rt_suite', name: 'Executive Suite' },
];

const VALID_STATUSES = ['available', 'maintenance', 'out-of-order'];

class RoomValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

class RoomUnavailableError extends Error {
  constructor(reason) {
    super('room_unavailable');
    this.statusCode = 409;
    this.reason = reason;
  }
}

function normalizeIdentifier(v) {
  return (v || '').trim().toLowerCase();
}

function listRoomTypes() {
  return ROOM_TYPES.slice();
}

function findRoomByIdentifier(identifier) {
  const normalized = normalizeIdentifier(identifier);
  return Array.from(rooms.values()).find((r) => normalizeIdentifier(r.identifier) === normalized);
}

function createRoom(data, actor) {
  const identifier = (data.identifier || '').trim();
  const roomTypeId = data.roomTypeId;
  const fields = {};

  if (!identifier) {
    fields.identifier = 'Enter a unique room identifier.';
  } else if (findRoomByIdentifier(identifier)) {
    fields.identifier = `Room ${identifier} already exists. Choose a different identifier.`;
  }

  if (!roomTypeId || !ROOM_TYPES.some((rt) => rt.id === roomTypeId)) {
    fields.roomTypeId = 'Select a valid room type.';
  }

  if (Object.keys(fields).length > 0) {
    throw new RoomValidationError('validation_error', fields);
  }

  const iso = new Date().toISOString();
  const room = {
    id: crypto.randomUUID(),
    identifier,
    roomTypeId,
    status: 'available',
    createdAt: iso,
    updatedAt: iso,
  };

  rooms.set(room.id, room);
  return room;
}

function getRoom(id) {
  return rooms.get(id);
}

function listRooms() {
  return Array.from(rooms.values());
}

function updateRoomStatus(id, status, actor) {
  const room = rooms.get(id);
  if (!room) return undefined;

  if (!VALID_STATUSES.includes(status)) {
    throw new RoomValidationError('validation_error', { status: 'Select a valid room status.' });
  }

  room.status = status;
  room.updatedAt = new Date().toISOString();
  return room;
}

function checkRoomBookable(id) {
  const room = rooms.get(id);
  if (!room) return { bookable: false, reason: 'Room not found.' };
  if (room.status === 'available') {
    return { bookable: true, reason: null };
  }
  return { bookable: false, reason: `Room ${room.identifier} is currently ${room.status} and cannot accept new bookings.` };
}

function requestBooking(id) {
  const { bookable, reason } = checkRoomBookable(id);
  if (!bookable) {
    throw new RoomUnavailableError(reason);
  }
  return { roomId: id, status: 'accepted' };
}

module.exports = {
  RoomValidationError,
  RoomUnavailableError,
  listRoomTypes,
  createRoom,
  getRoom,
  listRooms,
  updateRoomStatus,
  checkRoomBookable,
  requestBooking,
};
