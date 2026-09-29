const {
  createReservation,
  getReservation,
  listReservations,
  updateReservation,
  canCreateReservation,
  clearReservations,
  ReservationValidationError,
  ReservationConflictError,
  ReservationImmutableFieldError,
} = require('../src/reservations/store');

beforeEach(() => {
  clearReservations();
});

test('AC1: creating a reservation with valid fields results in booked status', () => {
  const reservation = createReservation({
    guestId: 'gst_1005', roomId: 'room_101',
    checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 150,
  }, 'Priya Nair');
  expect(reservation.status).toBe('booked');
  expect(getReservation(reservation.id)).toMatchObject({ id: reservation.id, status: 'booked' });
});

test('AC2: the submitted room rate is recorded on the created reservation', () => {
  const reservation = createReservation({
    guestId: 'gst_1005', roomId: 'room_102',
    checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 175,
  }, 'actor');
  expect(reservation.roomRate).toBe(175);
});

test('AC3: editing the room rate after booking is rejected and the original rate is retained', () => {
  const reservation = createReservation({
    guestId: 'gst_1005', roomId: 'room_103',
    checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 150,
  }, 'actor');
  expect(() => updateReservation(reservation.id, { roomRate: 200 })).toThrow(ReservationImmutableFieldError);
  expect(getReservation(reservation.id).roomRate).toBe(150);
});

test('AC4: booking the same room for an overlapping date range is rejected with a conflict error', () => {
  createReservation({ guestId: 'gst_1005', roomId: 'room_202', checkInDate: '2026-11-01', checkOutDate: '2026-11-10', roomRate: 100 }, 'actor');
  expect(() => createReservation({
    guestId: 'gst_1006', roomId: 'room_202', checkInDate: '2026-11-05', checkOutDate: '2026-11-12', roomRate: 120,
  }, 'actor')).toThrow(ReservationConflictError);
});

test('AC5: booking with check-in on the prior reservation checkout date is accepted (same-day turnover)', () => {
  createReservation({ guestId: 'gst_1005', roomId: 'room_303', checkInDate: '2026-12-01', checkOutDate: '2026-12-04', roomRate: 100 }, 'actor');
  const second = createReservation({
    guestId: 'gst_1006', roomId: 'room_303', checkInDate: '2026-12-04', checkOutDate: '2026-12-08', roomRate: 110,
  }, 'actor');
  expect(second.status).toBe('booked');
});

test('AC6: canCreateReservation allows front_desk and denies housekeeping and unknown roles', () => {
  expect(canCreateReservation('front_desk')).toBe(true);
  expect(canCreateReservation('housekeeping')).toBe(false);
  expect(canCreateReservation(undefined)).toBe(false);
});

test('createReservation throws a structured ReservationValidationError when required fields are missing', () => {
  const before = listReservations().length;
  expect(() => createReservation({ guestId: 'gst_1005' }, 'actor')).toThrow(ReservationValidationError);
  try {
    createReservation({ guestId: 'gst_1005' }, 'actor');
  } catch (err) {
    expect(err).toBeInstanceOf(ReservationValidationError);
    expect(err.fields).toMatchObject({
      roomId: expect.any(String),
      checkInDate: expect.any(String),
      checkOutDate: expect.any(String),
      roomRate: expect.any(String),
    });
  }
  expect(listReservations().length).toBe(before);
});

test('createReservation rejects a check-out date that is not after the check-in date', () => {
  expect(() => createReservation({
    guestId: 'gst_1005', roomId: 'room_909', checkInDate: '2026-10-05', checkOutDate: '2026-10-01', roomRate: 100,
  }, 'actor')).toThrow(ReservationValidationError);
});
