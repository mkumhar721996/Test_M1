const { addMonths, computeExpiryDate, isPastRetention } = require('../src/reporting/retention');

test('addMonths adds whole calendar months to an ISO date', () => {
  expect(addMonths('2026-08-15', 12)).toBe('2027-08-15');
});

test('EDGE: addMonths clamps to the last day of the target month rather than overflowing', () => {
  expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
});

test('computeExpiryDate adds the retention period in whole months', () => {
  expect(computeExpiryDate('2026-08-15', 12)).toBe('2027-08-15');
  expect(computeExpiryDate('2025-06-02', 12)).toBe('2026-06-02');
});

test('isPastRetention is true once "now" is strictly after the expiry date', () => {
  expect(isPastRetention('2025-06-10', 12, '2026-06-11')).toBe(true);
  expect(isPastRetention('2025-06-10', 12, '2026-06-09')).toBe(false);
});

test('EDGE: a record is not yet expired on the exact expiry date, only the day after', () => {
  expect(isPastRetention('2026-08-15', 12, '2027-08-15')).toBe(false);
  expect(isPastRetention('2026-08-15', 12, '2027-08-16')).toBe(true);
});
