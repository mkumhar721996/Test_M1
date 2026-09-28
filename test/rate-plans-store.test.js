let RatePlanValidationError;
let createRatePlan;
let getRatePlan;
let listRatePlans;
let updateRatePlan;
let deleteRatePlan;
let listRoomTypes;
let resolvePrice;

beforeEach(() => {
  jest.resetModules();
  ({
    RatePlanValidationError,
    createRatePlan,
    getRatePlan,
    listRatePlans,
    updateRatePlan,
    deleteRatePlan,
    listRoomTypes,
    resolvePrice,
  } = require('../src/ratePlans/store'));
});

test('AC1: creating a rate plan with a name, date range, and one price is saved and listed', () => {
  const plan = createRatePlan({
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    prices: [{ roomType: 'STD-KING', price: 159 }],
  });
  expect(typeof plan.id).toBe('string');
  expect(listRatePlans().some((p) => p.id === plan.id)).toBe(true);
});

test("AC2: editing a plan's price changes future price lookups", () => {
  const plan = createRatePlan({
    name: 'Autumn',
    startDate: '2026-09-01',
    endDate: '2026-11-30',
    prices: [{ roomType: 'GARDEN', price: 135 }],
  });
  updateRatePlan(plan.id, { prices: [{ roomType: 'GARDEN', price: 99 }] });
  expect(resolvePrice('GARDEN', '2026-10-01')).toMatchObject({ source: 'plan', price: 99 });
});

test("AC2: editing a plan's name and date range takes effect for future lookups", () => {
  const plan = createRatePlan({
    name: 'Spring',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    prices: [{ roomType: 'OCEAN', price: 200 }],
  });
  updateRatePlan(plan.id, { name: 'Spring Renamed', startDate: '2026-04-01', endDate: '2026-04-30' });
  expect(resolvePrice('OCEAN', '2026-03-15')).toEqual({ source: 'base', roomType: 'OCEAN', price: 189 });
  expect(resolvePrice('OCEAN', '2026-04-15')).toMatchObject({ source: 'plan', price: 200 });
  expect(getRatePlan(plan.id).name).toBe('Spring Renamed');
});

test('AC3: a room type not listed on a plan falls back to its base rate', () => {
  createRatePlan({
    name: 'Autumn Weekday Rate',
    startDate: '2026-09-01',
    endDate: '2026-11-30',
    prices: [{ roomType: 'GARDEN', price: 135 }],
  });
  expect(resolvePrice('STD-KING', '2026-10-01')).toEqual({ source: 'base', roomType: 'STD-KING', price: 129 });
});

test('AC3: removing a price row makes that room type fall back to base rate', () => {
  const plan = createRatePlan({
    name: 'Removable',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    prices: [
      { roomType: 'GARDEN', price: 100 },
      { roomType: 'OCEAN', price: 210 },
    ],
  });
  updateRatePlan(plan.id, { prices: [{ roomType: 'GARDEN', price: 100 }] });
  expect(resolvePrice('OCEAN', '2026-01-15')).toEqual({ source: 'base', roomType: 'OCEAN', price: 189 });
  expect(resolvePrice('GARDEN', '2026-01-15')).toMatchObject({ source: 'plan', price: 100 });
});

test('AC4: two overlapping plans resolve deterministically to the most-recently-created plan, without erroring', () => {
  const older = createRatePlan({
    name: 'Winter Promo 2026',
    startDate: '2026-12-01',
    endDate: '2027-01-15',
    prices: [{ roomType: 'STD-KING', price: 99 }],
  });
  const newer = createRatePlan({
    name: 'Holiday Flash Sale',
    startDate: '2026-12-20',
    endDate: '2026-12-31',
    prices: [{ roomType: 'STD-KING', price: 89 }],
  });
  expect(() => resolvePrice('STD-KING', '2026-12-25')).not.toThrow();
  const result = resolvePrice('STD-KING', '2026-12-25');
  expect(result.plan.id).toBe(newer.id);
  expect(result.price).toBe(89);
  expect(result.overlapping[0].id).toBe(older.id);
});

test('AC5/AC6: a missing name is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({
    name: '', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'GARDEN', price: 100 }],
  })).toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('AC5/AC6: an end date before the start date is rejected and not saved', () => {
  const before = listRatePlans().length;
  expect(() => createRatePlan({
    name: 'Bad Range', startDate: '2026-05-10', endDate: '2026-05-01', prices: [{ roomType: 'GARDEN', price: 100 }],
  })).toThrow(RatePlanValidationError);
  expect(listRatePlans().length).toBe(before);
});

test('validation: at least one price row is required', () => {
  expect(() => createRatePlan({
    name: 'No Prices', startDate: '2026-01-01', endDate: '2026-01-10', prices: [],
  })).toThrow(RatePlanValidationError);
});

test('validation: a duplicate room type within a plan is rejected', () => {
  expect(() => createRatePlan({
    name: 'Dup',
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    prices: [{ roomType: 'GARDEN', price: 100 }, { roomType: 'GARDEN', price: 120 }],
  })).toThrow(RatePlanValidationError);
});

test('validation: a price of 0 or less is rejected', () => {
  expect(() => createRatePlan({
    name: 'Zero Price', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'GARDEN', price: 0 }],
  })).toThrow(RatePlanValidationError);
});

test('validation: an unknown room type code is rejected', () => {
  expect(() => createRatePlan({
    name: 'Unknown Room', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'NOT-REAL', price: 100 }],
  })).toThrow(RatePlanValidationError);
});

test('deleteRatePlan removes the plan and returns true; unknown id returns false', () => {
  const plan = createRatePlan({
    name: 'Deletable', startDate: '2026-02-01', endDate: '2026-02-10', prices: [{ roomType: 'GARDEN', price: 100 }],
  });
  expect(deleteRatePlan(plan.id)).toBe(true);
  expect(getRatePlan(plan.id)).toBeUndefined();
  expect(deleteRatePlan(plan.id)).toBe(false);
});

test('listRoomTypes returns the seeded room types with base rates', () => {
  const roomTypes = listRoomTypes();
  expect(roomTypes).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'STD-KING', name: 'Standard King', baseRate: 129 }),
    expect.objectContaining({ code: 'GARDEN', name: 'Garden Room', baseRate: 149 }),
    expect.objectContaining({ code: 'OCEAN', name: 'Ocean View Suite', baseRate: 189 }),
    expect.objectContaining({ code: 'POOLSIDE', name: 'Poolside Cabana Suite', baseRate: 219 }),
  ]));
});

test('AC8: no rate plan covers this room type/date, so the base rate is returned', () => {
  expect(resolvePrice('POOLSIDE', '1999-01-01')).toEqual({ source: 'base', roomType: 'POOLSIDE', price: 219 });
});
