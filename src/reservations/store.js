const crypto = require('crypto');

const reservations = new Map();

const ROLE_PERMISSIONS = {
  front_desk: true,
  housekeeping: false,
};

function canCreateReservation(role) {
  return ROLE_PERMISSIONS[role] === true;
}

class ReservationValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

class ReservationConflictError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409;
  }
}

class ReservationImmutableFieldError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function assertValid({ guestId, roomId, checkInDate, checkOutDate, roomRate }) {
  const fields = {};
  if (!guestId) {
    fields.guestId = 'Select a guest for this reservation.';
  }
  if (!roomId) {
    fields.roomId = 'Select a room for this reservation.';
  }
  const inTime = new Date(checkInDate).getTime();
  const outTime = new Date(checkOutDate).getTime();
  if (!checkInDate || Number.isNaN(inTime)) {
    fields.checkInDate = 'Enter a valid check-in date.';
  }
  if (!checkOutDate || Number.isNaN(outTime)) {
    fields.checkOutDate = 'Enter a valid check-out date.';
  } else if (!Number.isNaN(inTime) && outTime <= inTime) {
    fields.checkOutDate = 'Check-out date must be after the check-in date.';
  }
  if (typeof roomRate !== 'number' || Number.isNaN(roomRate)) {
    fields.roomRate = 'Enter a numeric room rate.';
  }
  if (Object.keys(fields).length > 0) {
    throw new ReservationValidationError('validation_error', fields);
  }
}

const ACTIVE_STATUSES = ['booked', 'checked_in'];

function hasOverlap(roomId, checkInDate, checkOutDate) {
  const inTime = new Date(checkInDate).getTime();
  const outTime = new Date(checkOutDate).getTime();
  return Array.from(reservations.values()).some((r) =>
    r.roomId === roomId &&
    ACTIVE_STATUSES.includes(r.status) &&
    new Date(r.checkInDate).getTime() < outTime &&
    inTime < new Date(r.checkOutDate).getTime()
  );
}

function createReservation(data, actor) {
  const { guestId, roomId, checkInDate, checkOutDate, roomRate } = data;
  assertValid({ guestId, roomId, checkInDate, checkOutDate, roomRate });

  if (hasOverlap(roomId, checkInDate, checkOutDate)) {
    throw new ReservationConflictError('conflict');
  }

  const iso = new Date().toISOString();
  const reservation = {
    id: crypto.randomUUID(),
    guestId,
    roomId,
    checkInDate,
    checkOutDate,
    roomRate,
    status: 'booked',
    createdAt: iso,
    actor,
  };

  reservations.set(reservation.id, reservation);
  return reservation;
}

function getReservation(id) {
  return reservations.get(id);
}

function listReservations() {
  return Array.from(reservations.values());
}

function updateReservation(id, changes) {
  if ('roomRate' in changes) {
    throw new ReservationImmutableFieldError('immutable_field', {
      roomRate: 'The room rate is locked at booking time and cannot be changed.',
    });
  }

  const reservation = reservations.get(id);
  if (!reservation) return undefined;

  Object.assign(reservation, changes);
  return reservation;
}

module.exports = {
  ReservationValidationError,
  ReservationConflictError,
  ReservationImmutableFieldError,
  createReservation,
  getReservation,
  listReservations,
  updateReservation,
  canCreateReservation,
};
