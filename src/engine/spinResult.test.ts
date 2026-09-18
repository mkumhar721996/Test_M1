import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSpinResult } from './spinResult.ts';

test('assembles the full result payload for a single winning line', () => {
  const result = assembleSpinResult({
    seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
    reelStops: [12, 45, 3, 27, 8],
    betLevel: 3,
    winningLines: [{ lineIndex: 7, basePayout: 40 }],
  });

  assert.deepEqual(result, {
    seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
    reelStops: [12, 45, 3, 27, 8],
    winningLines: [{ lineIndex: 7, basePayout: 40, creditAward: 120 }],
    totalCreditsWon: 120,
  });
});

test('returns an empty winning-lines list when there are no wins', () => {
  const result = assembleSpinResult({
    seed: 'd4a1c7e2-9f5b-4e8a-b3d6-2f7a8c1e4b90',
    reelStops: [17, 33, 5, 41, 22],
    betLevel: 5,
    winningLines: [],
  });

  assert.deepEqual(result.winningLines, []);
});

test('totals zero credits when there are no wins', () => {
  const result = assembleSpinResult({
    seed: 'd4a1c7e2-9f5b-4e8a-b3d6-2f7a8c1e4b90',
    reelStops: [17, 33, 5, 41, 22],
    betLevel: 5,
    winningLines: [],
  });

  assert.equal(result.totalCreditsWon, 0);
});

test('sums bet-scaled credit amounts across all winning lines', () => {
  const result = assembleSpinResult({
    seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
    reelStops: [12, 45, 3, 27, 8],
    betLevel: 3,
    winningLines: [
      { lineIndex: 7, basePayout: 40 },
      { lineIndex: 2, basePayout: 25 },
      { lineIndex: 9, basePayout: 100 },
    ],
  });

  assert.equal(result.totalCreditsWon, 40 * 3 + 25 * 3 + 100 * 3);
});

test('orders winning lines ascending by pay-line index regardless of input order', () => {
  const result = assembleSpinResult({
    seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
    reelStops: [12, 45, 3, 27, 8],
    betLevel: 3,
    winningLines: [
      { lineIndex: 7, basePayout: 40 },
      { lineIndex: 2, basePayout: 25 },
      { lineIndex: 9, basePayout: 100 },
    ],
  });

  assert.deepEqual(
    result.winningLines.map((l) => l.lineIndex),
    [2, 7, 9],
  );
});
