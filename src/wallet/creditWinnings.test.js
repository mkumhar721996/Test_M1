import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditWinnings } from './creditWinnings.js';

test('adds a positive winning amount to the current balance', () => {
  assert.equal(creditWinnings(100, 25), 125);
});

test('leaves the balance unchanged when winnings are zero', () => {
  assert.equal(creditWinnings(100, 0), 100);
});
