const { formatCurrencyUSD } = require('../public/currency');

test('formats a number as USD with a $ symbol and two decimal places', () => {
  expect(formatCurrencyUSD(12.5)).toBe('$12.50');
});

test('rounds to two decimal places', () => {
  expect(formatCurrencyUSD(9.999)).toBe('$10.00');
});

test('adds thousands separators for large amounts', () => {
  expect(formatCurrencyUSD(1234.5)).toBe('$1,234.50');
});
