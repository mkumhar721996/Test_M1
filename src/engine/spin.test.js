import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spin } from './spin.js';
import { InvalidSeedError } from './seed.js';
import { fiveReelFixture } from './fixtures/reels.fixture.js';

test('AC1: produces identical stops for the same seed across runs', () => {
  const first = spin({ seed: 999, reels: fiveReelFixture });
  const second = spin({ seed: 999, reels: fiveReelFixture });
  assert.deepEqual(first.stops, second.stops);
});

test('AC2: keeps each reel stop within that reel own strip bounds', () => {
  const result = spin({ seed: 555, reels: fiveReelFixture });
  result.stops.forEach((stop, i) => {
    assert.ok(stop >= 0);
    assert.ok(stop < fiveReelFixture[i].symbols.length);
  });
});

test('AC3: includes the seed and one stop index per reel in the result', () => {
  const result = spin({ seed: 42, reels: fiveReelFixture });
  assert.equal(result.seed, 42);
  assert.equal(result.stops.length, 5);
});

test('AC4: differs in at least one reel stop between two different seeds', () => {
  const a = spin({ seed: 1, reels: fiveReelFixture });
  const b = spin({ seed: 2, reels: fiveReelFixture });
  assert.notDeepEqual(a.stops, b.stops);
});

test('AC5: reproduces the full result when the same external seed is supplied again', () => {
  const a = spin({ seed: 2024, reels: fiveReelFixture });
  const b = spin({ seed: 2024, reels: fiveReelFixture });
  assert.deepEqual(a, b);
});

test('AC6: returns the symbols configured at each stop position for every reel', () => {
  const result = spin({ seed: 42, reels: fiveReelFixture });
  result.symbols.forEach((symbolsForReel, i) => {
    assert.deepEqual(symbolsForReel, [fiveReelFixture[i].symbols[result.stops[i]]]);
  });
});

test('AC7: auto-generates a seed and includes it in the result when none is supplied', () => {
  const result = spin({ reels: fiveReelFixture });
  assert.ok(Number.isInteger(result.seed));
});

test('AC8: rejects a spin request carrying an invalid seed', () => {
  assert.throws(() => spin({ seed: 'not-a-number', reels: fiveReelFixture }), InvalidSeedError);
  assert.throws(() => spin({ seed: -1, reels: fiveReelFixture }), InvalidSeedError);
});
