const crypto = require('crypto');
const { getRoomType } = require('../roomTypes/store');

const rooms = new Map();

const STATUSES = ['available', 'maintenance', 'out-of-order'];

class RoomValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

class RoomUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409;
  }
}

function findByIdentifier(identifier) {
  return Array.from(rooms.values()).find((r) => r.identifier === identifier);
}

function createRoom(data, actor) {
  const identifier = (data.identifier || '').trim();
  if (!identifier) {
    throw new RoomValidationError('identifier is required');
  }
  const roomTypeId = data.roomTypeId;
  if (!roomTypeId || !getRoomType(roomTypeId)) {
    throw new RoomValidationError('roomTypeId must reference an existing room type');
  }
  if (findByIdentifier(identifier)) {
    throw new RoomValidationError(`a room with identifier '${identifier}' already exists`);
  }

  const iso = new Date().toISOString();
  const room = {
    id: crypto.randomUUID(),
    identifier,
    roomTypeId,
    status: 'available',
    createdAt: iso,
    updatedAt: iso,
    auditLog: [{ ts: iso, actor, action: 'created room' }],
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

  if (!STATUSES.includes(status)) {
    throw new RoomValidationError(`status must be one of: ${STATUSES.join(', ')}`);
  }

  if (room.status === status) {
    return room;
  }

  const iso = new Date().toISOString();
  const from = room.status;
  room.status = status;
  room.updatedAt = iso;
  room.auditLog.push({ ts: iso, actor, action: `status changed from ${from} to ${status}` });
  return room;
}

function requestBooking(roomId) {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  if (room.status !== 'available') {
    throw new RoomUnavailableError(`room ${room.identifier} is unavailable for booking: status is '${room.status}'`);
  }

  return { roomId, accepted: true };
}

module.exports = {
  STATUSES,
  RoomValidationError,
  RoomUnavailableError,
  createRoom,
  getRoom,
  listRooms,
  updateRoomStatus,
  requestBooking,
};
