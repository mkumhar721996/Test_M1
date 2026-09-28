const { createGuest, getGuest, listGuests, findGuestMatch, canCreateGuest, GuestValidationError } = require('../src/guests/store');

test('AC4: createGuest returns a stable identifier that getGuest resolves to the same profile', () => {
  const guest = createGuest({ name: 'Alex Rivera', email: 'alex@example.com' });
  expect(guest.id).toBeTruthy();
  expect(getGuest(guest.id)).toMatchObject({ id: guest.id, name: 'Alex Rivera', email: 'alex@example.com' });
});

test('AC5/AC6: createGuest throws a structured GuestValidationError with per-field messages and creates nothing', () => {
  const before = listGuests().length;
  expect(() => createGuest({ name: '' })).toThrow(GuestValidationError);
  try {
    createGuest({ name: '' });
  } catch (err) {
    expect(err).toBeInstanceOf(GuestValidationError);
    expect(err.fields).toMatchObject({ name: expect.any(String) });
  }
  expect(listGuests().length).toBe(before);
});

test('AC5/AC6: createGuest requires at least one of email/phone, reported as structured fields', () => {
  expect.assertions(2);
  try {
    createGuest({ name: 'A' });
  } catch (err) {
    expect(err).toBeInstanceOf(GuestValidationError);
    expect(err.fields).toMatchObject({ email: expect.any(String), phone: expect.any(String) });
  }
});

test('AC2: findGuestMatch finds a seeded guest by normalized email or phone', () => {
  expect(findGuestMatch({ email: 'JORDAN.LEE@example.com' })).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
  expect(findGuestMatch({ phone: '555-123-4567' })).toMatchObject({ id: 'gst_1005' });
  expect(findGuestMatch({ email: 'nobody@example.com', phone: '000' })).toBeUndefined();
});

test('findGuestMatch coerces a repeated query param (parsed as an array) instead of throwing', () => {
  expect(() => findGuestMatch({ email: ['jordan.lee@example.com', 'other@example.com'] })).not.toThrow();
  expect(findGuestMatch({ email: ['jordan.lee@example.com', 'other@example.com'] })).toMatchObject({ id: 'gst_1005' });
});

test('createGuest rejects a malformed email or phone with structured field errors and creates nothing', () => {
  const before = listGuests().length;
  expect(() => createGuest({ name: 'Alex Rivera', email: 'not-an-email' })).toThrow(GuestValidationError);
  expect(() => createGuest({ name: 'Alex Rivera', phone: '123' })).toThrow(GuestValidationError);
  expect(listGuests().length).toBe(before);
});

test('AC9: canCreateGuest allows front_desk and denies housekeeping and unknown roles', () => {
  expect(canCreateGuest('front_desk')).toBe(true);
  expect(canCreateGuest('housekeeping')).toBe(false);
  expect(canCreateGuest('someone_else')).toBe(false);
  expect(canCreateGuest(undefined)).toBe(false);
});
