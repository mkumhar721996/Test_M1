import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.js';
import { pickStop, symbolsAtStop } from './reels.js';

test('pickStop draws a stop index within that reel strip own bounds', () => {
  const strip = { symbols: ['A', 'B', 'C', 'D'] };
  const rng = createRng(3);
  for (let i = 0; i < 200; i++) {
    const stop = pickStop(rng, strip);
    assert.ok(stop >= 0);
    assert.ok(stop < strip.symbols.length);
  }
});

test('symbolsAtStop returns the symbol configured at the chosen stop position', () => {
  const strip = { symbols: ['A', 'B', 'C'] };
  assert.deepEqual(symbolsAtStop(strip, 1), ['B']);
});
