import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../../src/engine/validateConfig.js';
import { ConfigValidationError } from '../../src/engine/errors.js';

function validFixture() {
  return {
    grid: { reels: 5, rows: 3 },
    symbols: [
      { id: 'CHERRY', basePayout: 2 },
      { id: 'BAR', basePayout: 10 },
    ],
    reelStrips: [
      ['CHERRY', 'BAR', 'CHERRY'],
      ['CHERRY', 'BAR', 'CHERRY'],
      ['CHERRY', 'BAR', 'CHERRY'],
      ['CHERRY', 'BAR', 'CHERRY'],
      ['CHERRY', 'BAR', 'CHERRY'],
    ],
    paylines: [{ id: 'line-1', positions: [0, 0, 0, 0, 0] }],
    betLevels: [1, 2, 5, 10],
  };
}

test('passes through a fully valid config without throwing', () => {
  assert.doesNotThrow(() => validateConfig(validFixture()));
});

test('rejects a payline referencing a row outside the grid', () => {
  const bad = { ...validFixture(), paylines: [{ id: 'line-1', positions: [0, 0, 3, 0, 0] }] };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /line-1/ });
});

test('rejects a symbol with a negative base payout', () => {
  const bad = { ...validFixture(), symbols: [{ id: 'CHERRY', basePayout: -5 }] };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /CHERRY/ });
});

test('rejects a bet level of zero', () => {
  const bad = { ...validFixture(), betLevels: [1, 0, 5] };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /bet level.*0/i });
});

test('rejects a grid with zero reels', () => {
  const bad = { ...validFixture(), grid: { reels: 0, rows: 3 } };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /reels/i });
});

test('rejects a grid with a negative row count', () => {
  const bad = { ...validFixture(), grid: { reels: 5, rows: -1 } };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /rows/i });
});

test('rejects a reel strip referencing an undefined symbol id', () => {
  const fixture = validFixture();
  fixture.reelStrips = [
    ['CHERRY', 'GHOST', 'BAR'],
    ...fixture.reelStrips.slice(1),
  ];
  assert.throws(() => validateConfig(fixture), {
    name: 'ConfigValidationError',
    message: /reel 0.*GHOST/i,
  });
});

test('rejects an empty reel strip', () => {
  const fixture = validFixture();
  fixture.reelStrips = [[], ...fixture.reelStrips.slice(1)];
  assert.throws(() => validateConfig(fixture), { name: 'ConfigValidationError', message: /reel 0.*empty/i });
});

test('rejects a reel strip shorter than the configured row count', () => {
  const fixture = validFixture();
  fixture.reelStrips = [['CHERRY', 'BAR'], ...fixture.reelStrips.slice(1)];
  assert.throws(() => validateConfig(fixture), {
    name: 'ConfigValidationError',
    message: /reel 0.*fewer/i,
  });
});

test('rejects duplicate symbol identifiers', () => {
  const bad = {
    ...validFixture(),
    symbols: [
      { id: 'CHERRY', basePayout: 1 },
      { id: 'CHERRY', basePayout: 2 },
    ],
  };
  assert.throws(() => validateConfig(bad), { name: 'ConfigValidationError', message: /CHERRY/ });
});
