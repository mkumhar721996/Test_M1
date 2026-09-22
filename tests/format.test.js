import { test, expect } from 'vitest';
import { formatCurrency, formatDate } from '../src/format.js';

test('formats amounts as USD with two decimals and a dollar sign', () => {
  expect(formatCurrency(9)).toBe('$9.00');
  expect(formatCurrency(128.4)).toBe('$128.40');
});

test('formats an ISO date as a short human-readable date', () => {
  expect(formatDate('2026-09-17')).toBe('Sep 17, 2026');
});
