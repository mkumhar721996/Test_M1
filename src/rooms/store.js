const crypto = require('crypto');

const rooms = new Map();

const ROLE_PERMISSIONS = {
  front_desk: true,
  housekeeping: false,
};

function canManageRooms(role) {
  return ROLE_PERMISSIONS[role] === true;
}

class RoomValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

class RoomMaintenanceBlockedError extends Error {
  constructor(message, conflictingReservations = []) {
    super(message);
    this.statusCode = 409;
    this.conflictingReservations = conflictingReservations;
  }
}

const VALID_TYPES = ['Standard', 'Deluxe', 'Suite'];
const VALID_STATUSES = ['available', 'occupied', 'maintenance'];

function roomExistsWithNumber(number, excludeId) {
  const needle = String(number).trim().toLowerCase();
  return Array.from(rooms.values()).some(
    (r) => r.id !== excludeId && String(r.number).trim().toLowerCase() === needle
  );
}

function assertValid(number, type, status, excludeId) {
  const fields = {};
  if (!number) {
    fields.number = 'Enter a room number.';
  } else if (roomExistsWithNumber(number, excludeId)) {
    fields.number = `Room ${number} already exists. Enter a different room number.`;
  }
  if (!type || !VALID_TYPES.includes(type)) {
    fields.type = 'Select a valid room type.';
  }
  if (!status || !VALID_STATUSES.includes(status)) {
    fields.status = 'Select a valid room status.';
  }
  if (Object.keys(fields).length > 0) {
    throw new RoomValidationError('validation_error', fields);
  }
}

function assertMaintenanceTransitionAllowed(room, nextStatus) {
  if (nextStatus !== 'maintenance') return;
  const conflicting = room.reservations || [];
  if (conflicting.length === 0) return;

  const checkedIn = conflicting.filter((r) => r.state === 'checked_in').length;
  const booked = conflicting.filter((r) => r.state === 'booked').length;
  const parts = [];
  if (checkedIn) parts.push(`${checkedIn} checked-in`);
  if (booked) parts.push(`${booked} booked`);
  const summary = `${parts.join(', ')} reservation${conflicting.length > 1 ? 's' : ''}`;
  const first = conflicting[0];
  const message = `Can't move Room ${room.number} to Maintenance — it has ${summary} (${first.guest}, ${first.dates}). Resolve or reassign the conflicting reservation${conflicting.length > 1 ? 's' : ''} first.`;
  throw new RoomMaintenanceBlockedError(message, conflicting);
}

function createRoom(data) {
  const number = data.number || '';
  const type = data.type || '';
  const status = data.status || '';
  assertValid(number, type, status, null);

  const iso = new Date().toISOString();
  const room = {
    id: crypto.randomUUID(),
    number,
    type,
    status,
    active: true,
    createdAt: iso,
    reservations: Array.isArray(data.reservations) ? data.reservations : [],
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

function updateRoom(id, changes) {
  const room = rooms.get(id);
  if (!room) return undefined;

  const nextNumber = 'number' in changes ? changes.number : room.number;
  const nextType = 'type' in changes ? changes.type : room.type;
  const nextStatus = 'status' in changes ? changes.status : room.status;
  assertValid(nextNumber, nextType, nextStatus, room.id);

  if ('status' in changes && changes.status !== room.status) {
    assertMaintenanceTransitionAllowed(room, changes.status);
  }

  if ('number' in changes) room.number = changes.number;
  if ('type' in changes) room.type = changes.type;
  if ('status' in changes) room.status = changes.status;

  return room;
}

function deactivateRoom(id) {
  const room = rooms.get(id);
  if (!room) return undefined;

  room.active = false;
  room.deactivatedAt = new Date().toISOString();
  return room;
}

function reactivateRoom(id) {
  const room = rooms.get(id);
  if (!room) return undefined;

  room.active = true;
  delete room.deactivatedAt;
  return room;
}

module.exports = {
  RoomValidationError,
  RoomMaintenanceBlockedError,
  canManageRooms,
  createRoom,
  getRoom,
  listRooms,
  updateRoom,
  deactivateRoom,
  reactivateRoom,
};
