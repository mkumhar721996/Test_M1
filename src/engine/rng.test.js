import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextInt } from './rng.js';

test('createRng produces the same sequence of draws for the same seed', () => {
  const rngA = createRng(1234);
  const rngB = createRng(1234);
  const sequenceA = Array.from({ length: 10 }, () => rngA());
  const sequenceB = Array.from({ length: 10 }, () => rngB());
  assert.deepEqual(sequenceA, sequenceB);
});

test('createRng produces a different sequence for a different seed', () => {
  const rngA = createRng(1);
  const rngB = createRng(2);
  const sequenceA = Array.from({ length: 10 }, () => rngA());
  const sequenceB = Array.from({ length: 10 }, () => rngB());
  assert.notDeepEqual(sequenceA, sequenceB);
});

test('nextInt keeps every draw within [0, exclusiveMax) over many samples', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const n = nextInt(rng, 20);
    assert.ok(Number.isInteger(n));
    assert.ok(n >= 0);
    assert.ok(n < 20);
  }
});
