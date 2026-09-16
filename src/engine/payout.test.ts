import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayout } from './payout.ts';

test('multiplies base payout by bet level', () => {
  assert.equal(calculatePayout(25, 3), 75);
});
