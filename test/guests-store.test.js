const { createGuest, getGuest, listGuests, findGuestMatch, canCreateGuest, ValidationError, resetStore } = require('../src/guests/store');

afterEach(() => {
  resetStore();
});

test('AC3: createGuest returns a stable identifier that getGuest resolves to the same profile', () => {
  const guest = createGuest({ name: 'Alex Rivera', email: 'alex@example.com' });
  expect(guest.id).toBeTruthy();
  expect(getGuest(guest.id)).toMatchObject({ id: guest.id, name: 'Alex Rivera', email: 'alex@example.com' });
});

test('AC4: createGuest throws a ValidationError with per-field messages and creates nothing', () => {
  const before = listGuests().length;
  expect(() => createGuest({ name: '' })).toThrow(ValidationError);
  try {
    createGuest({ name: '' });
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields).toMatchObject({ name: expect.any(String) });
  }
  expect(listGuests().length).toBe(before);
});

test('AC4: createGuest requires at least one of email/phone and validates format', () => {
  expect(() => createGuest({ name: 'A' })).toThrow(ValidationError);
  try {
    createGuest({ name: 'A', email: 'not-an-email' });
  } catch (err) {
    expect(err.fields).toMatchObject({ email: expect.any(String) });
  }
  try {
    createGuest({ name: 'A', phone: '123' });
  } catch (err) {
    expect(err.fields).toMatchObject({ phone: expect.any(String) });
  }
});

test('AC2: findGuestMatch finds a seeded guest by normalized email or phone', () => {
  expect(findGuestMatch({ email: 'JORDAN.LEE@example.com' })).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
  expect(findGuestMatch({ phone: '555-123-4567' })).toMatchObject({ id: 'gst_1005' });
  expect(findGuestMatch({ email: 'nobody@example.com', phone: '000' })).toBeUndefined();
});

test('resetStore restores the store to exactly the three seeded fixture guests', () => {
  createGuest({ name: 'Alex Rivera', email: 'alex@example.com' });
  expect(listGuests().length).toBe(4);

  resetStore();

  expect(listGuests().map((g) => g.id).sort()).toEqual(['gst_1005', 'gst_1006', 'gst_1007']);
});

test('AC6: canCreateGuest allows front_desk and denies housekeeping and unknown roles', () => {
  expect(canCreateGuest('front_desk')).toBe(true);
  expect(canCreateGuest('housekeeping')).toBe(false);
  expect(canCreateGuest('someone_else')).toBe(false);
  expect(canCreateGuest(undefined)).toBe(false);
});
