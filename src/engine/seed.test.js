import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_MIN, SEED_MAX, InvalidSeedError, validateSeed, generateSeed } from './seed.js';

test('validateSeed accepts an integer within range and returns it', () => {
  assert.equal(validateSeed(42), 42);
  assert.equal(validateSeed(SEED_MIN), SEED_MIN);
  assert.equal(validateSeed(SEED_MAX), SEED_MAX);
});

test('validateSeed rejects a non-numeric seed', () => {
  assert.throws(() => validateSeed('abc'), InvalidSeedError);
});

test('validateSeed rejects a non-integer number', () => {
  assert.throws(() => validateSeed(1.5), InvalidSeedError);
});

test('validateSeed rejects a seed outside the valid range', () => {
  assert.throws(() => validateSeed(-1), InvalidSeedError);
  assert.throws(() => validateSeed(SEED_MAX + 1), InvalidSeedError);
});

test('generateSeed generates a seed within the valid range', () => {
  const seed = generateSeed();
  assert.ok(Number.isInteger(seed));
  assert.ok(seed >= SEED_MIN);
  assert.ok(seed <= SEED_MAX);
});
