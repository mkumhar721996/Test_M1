const {
  RatePlanValidationError,
  createRatePlan,
  listRatePlans,
  getRatePlan,
  updateRatePlan,
  deleteRatePlan,
  resolveRate,
} = require('../src/ratePlans/store');

const ACTOR = 'Jordan Blake';

describe('rate plans store', () => {
  test('AC7: a fresh store has no rate plans', () => {
    expect(listRatePlans()).toEqual([]);
  });

  test('AC1: creating a rate plan with a name, date range, and one price saves it', () => {
    const plan = createRatePlan(
      { name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-queen': 160 } },
      ACTOR,
    );
    expect(listRatePlans().map((p) => p.id)).toContain(plan.id);
  });

  test('AC2: updating a plan\'s price takes effect for future price lookups', () => {
    const plan = createRatePlan(
      { name: 'Winter Holidays 2026', startDate: '2026-12-20', endDate: '2027-01-02', prices: { 'rt-suite': 320 } },
      ACTOR,
    );
    updateRatePlan(plan.id, { prices: { 'rt-suite': 350 } }, ACTOR);
    expect(resolveRate('rt-suite', '2026-12-25')).toMatchObject({ price: 350, source: 'rate_plan' });
  });

  test('AC3: a room type not listed on the plan falls back to base rate inside the plan\'s own date range', () => {
    createRatePlan(
      { name: 'Shoulder Season Autumn', startDate: '2026-09-15', endDate: '2026-11-15', prices: { 'rt-queen': 130 } },
      ACTOR,
    );
    expect(resolveRate('rt-twin', '2026-10-01')).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
  });

  test('AC4: overlapping plans for the same room type resolve to the most recently created plan, deterministically', () => {
    createRatePlan(
      { name: 'Summer Peak 2026 B', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-king': 190 } },
      ACTOR,
    );
    const newer = createRatePlan(
      { name: 'Labor Day Weekend B', startDate: '2026-08-29', endDate: '2026-09-02', prices: { 'rt-king': 205 } },
      ACTOR,
    );
    expect(() => resolveRate('rt-king', '2026-08-30')).not.toThrow();
    expect(resolveRate('rt-king', '2026-08-30')).toMatchObject({ price: 205, ratePlanId: newer.id, overlapping: true });
  });

  test('AC6: a missing name is rejected and not saved', () => {
    expect(() => createRatePlan(
      { name: '', startDate: '2026-08-01', endDate: '2026-08-10', prices: { 'rt-queen': 100 } },
      ACTOR,
    )).toThrow(RatePlanValidationError);
  });

  test('AC6: an end date before the start date is rejected and not saved', () => {
    expect(() => createRatePlan(
      { name: 'Bad Range', startDate: '2026-08-10', endDate: '2026-08-01', prices: { 'rt-queen': 100 } },
      ACTOR,
    )).toThrow(RatePlanValidationError);
    expect(listRatePlans().some((p) => p.name === 'Bad Range')).toBe(false);
  });

  test('AC8: no active plan for a room type/date returns the base rate', () => {
    expect(resolveRate('rt-twin', '2020-01-01')).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
  });
});
