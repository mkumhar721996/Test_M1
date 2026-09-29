const {
  RatePlanValidationError,
  createRatePlan,
  getRatePlan,
  listRatePlans,
  updateRatePlan,
  deleteRatePlan,
  listRoomTypes,
  resolvePrice,
  resetRatePlansStore,
} = require('../src/ratePlans/store');

beforeEach(() => {
  resetRatePlansStore();
});

test('AC1: creating a rate plan with a name, date range, and one price assigns an id and is retrievable', () => {
  const plan = createRatePlan({
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    prices: [{ roomType: 'STD-KING', price: 159 }],
  });
  expect(typeof plan.id).toBe('string');
  expect(getRatePlan(plan.id)).toMatchObject({ name: 'Summer Peak 2026' });
});

test("AC2: editing a plan's price changes future price lookups", () => {
  const plan = createRatePlan({ name: 'Autumn', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }] });
  updateRatePlan(plan.id, { prices: [{ roomType: 'GARDEN', price: 99 }] });
  expect(resolvePrice('GARDEN', '2026-10-01')).toMatchObject({ source: 'plan', price: 99 });
});

test("AC3: a room type not listed on a plan falls back to its base rate", () => {
  createRatePlan({ name: 'Autumn Weekday Rate', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }] });
  expect(resolvePrice('STD-KING', '2026-10-01')).toEqual({ source: 'base', roomType: 'STD-KING', price: 129 });
});

test('AC4: two overlapping plans resolve deterministically to the most-recently-created plan, without erroring', () => {
  const older = createRatePlan({ name: 'Winter Promo 2026', startDate: '2026-12-01', endDate: '2027-01-15', prices: [{ roomType: 'STD-KING', price: 99 }] });
  const newer = createRatePlan({ name: 'Holiday Flash Sale', startDate: '2026-12-20', endDate: '2026-12-31', prices: [{ roomType: 'STD-KING', price: 89 }] });
  expect(() => resolvePrice('STD-KING', '2026-12-25')).not.toThrow();
  const result = resolvePrice('STD-KING', '2026-12-25');
  expect(result.plan.id).toBe(newer.id);
  expect(result.price).toBe(89);
  expect(result.overlapping[0].id).toBe(older.id);
  // repeated lookups stay consistent
  expect(resolvePrice('STD-KING', '2026-12-25')).toEqual(result);
});

test('AC5/AC6: a missing name is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({ name: '', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'GARDEN', price: 100 }] }))
    .toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: an end date before the start date is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({ name: 'Bad Range', startDate: '2026-05-10', endDate: '2026-05-01', prices: [{ roomType: 'GARDEN', price: 100 }] }))
    .toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: a plan with no price rows is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({ name: 'No Prices', startDate: '2026-05-01', endDate: '2026-05-10', prices: [] }))
    .toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: a duplicate room type within a plan is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({
    name: 'Dup', startDate: '2026-05-01', endDate: '2026-05-10',
    prices: [{ roomType: 'GARDEN', price: 100 }, { roomType: 'GARDEN', price: 120 }],
  })).toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: a price of zero or less is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({
    name: 'Zero Price', startDate: '2026-05-01', endDate: '2026-05-10',
    prices: [{ roomType: 'GARDEN', price: 0 }],
  })).toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: an unknown room type code is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({
    name: 'Unknown Room', startDate: '2026-05-01', endDate: '2026-05-10',
    prices: [{ roomType: 'NOT-A-ROOM', price: 100 }],
  })).toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC4: removing a price row from a plan drops the override and the room type falls back to base rate', () => {
  const plan = createRatePlan({
    name: 'Poolside And Ocean', startDate: '2026-04-01', endDate: '2026-04-30',
    prices: [{ roomType: 'POOLSIDE', price: 199 }, { roomType: 'OCEAN', price: 179 }],
  });
  expect(resolvePrice('OCEAN', '2026-04-15')).toMatchObject({ source: 'plan', price: 179 });
  updateRatePlan(plan.id, { prices: [{ roomType: 'POOLSIDE', price: 199 }] });
  expect(resolvePrice('OCEAN', '2026-04-15')).toEqual({ source: 'base', roomType: 'OCEAN', price: 189 });
});

test('AC9/AC8: no rate plan covers a room type/date, base rate is returned', () => {
  expect(resolvePrice('OCEAN', '1999-01-01')).toEqual({ source: 'base', roomType: 'OCEAN', price: 189 });
});

test('deleteRatePlan removes a plan and returns true; returns false for unknown id', () => {
  const plan = createRatePlan({ name: 'Temp', startDate: '2026-05-01', endDate: '2026-05-10', prices: [{ roomType: 'GARDEN', price: 100 }] });
  expect(deleteRatePlan(plan.id)).toBe(true);
  expect(getRatePlan(plan.id)).toBeUndefined();
  expect(deleteRatePlan(plan.id)).toBe(false);
});

test('listRoomTypes returns the seeded room types with base rates', () => {
  const roomTypes = listRoomTypes();
  expect(roomTypes).toEqual(expect.arrayContaining([
    { code: 'STD-KING', name: 'Standard King', baseRate: 129 },
    { code: 'GARDEN', name: 'Garden Room', baseRate: 149 },
    { code: 'OCEAN', name: 'Ocean View Suite', baseRate: 189 },
    { code: 'POOLSIDE', name: 'Poolside Cabana Suite', baseRate: 219 },
  ]));
});
