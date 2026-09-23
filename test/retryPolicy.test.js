const { MAX_ATTEMPTS, computeBackoffMs } = require('../src/runs/retryPolicy');

test('MAX_ATTEMPTS is 3', () => {
  expect(MAX_ATTEMPTS).toBe(3);
});

test('backoff matches the approved design (30s, then 2m)', () => {
  expect(computeBackoffMs(1)).toBe(30000);
  expect(computeBackoffMs(2)).toBe(120000);
});
