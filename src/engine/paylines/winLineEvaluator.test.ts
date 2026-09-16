import { describe, expect, it } from 'vitest';
import { PAY_LINES } from './paylines.config';
import type { SymbolGrid } from './types';
import { evaluateWinLines } from './winLineEvaluator';

const REEL_COUNT = 5;
const ROW_COUNT = 3;

// Every cell defaults to a globally-unique filler symbol (U<reel><row>) so that only
// cells explicitly overridden by a test can participate in a matching run.
function makeGrid(overrides: Record<string, string> = {}): SymbolGrid {
  return Array.from({ length: REEL_COUNT }, (_, reel) =>
    Array.from({ length: ROW_COUNT }, (_, row) => overrides[`${reel},${row}`] ?? `U${reel}${row}`),
  );
}

describe('evaluateWinLines', () => {
  it('checks all 9 configured pay-lines, including the last one', () => {
    expect(PAY_LINES).toHaveLength(9);
    // only line 8 ([1,2,2,2,1]) is set up to win, proving the last line is evaluated
    const grid = makeGrid({ '0,1': 'BAR', '1,2': 'BAR', '2,2': 'BAR' });
    expect(evaluateWinLines(grid)).toEqual([{ lineIndex: 8, symbol: 'BAR', matchLength: 3 }]);
  });

  it('records a winner with symbol id and match length for a 3-run from reel 0', () => {
    const grid = makeGrid({ '0,0': 'BAR', '1,0': 'BAR', '2,0': 'BAR' });
    expect(evaluateWinLines(grid)).toEqual([{ lineIndex: 1, symbol: 'BAR', matchLength: 3 }]);
  });

  it('excludes a line with only a 2-symbol run from reel 0', () => {
    const grid = makeGrid({ '0,0': 'BAR', '1,0': 'BAR' });
    expect(evaluateWinLines(grid)).toEqual([]);
  });

  it('identifies multiple simultaneous winning lines independently', () => {
    const grid = makeGrid({
      '0,0': 'LEMON',
      '1,0': 'LEMON',
      '2,0': 'LEMON',
      '0,2': 'PLUM',
      '1,2': 'PLUM',
      '2,2': 'PLUM',
    });
    expect(evaluateWinLines(grid)).toEqual([
      { lineIndex: 1, symbol: 'LEMON', matchLength: 3 },
      { lineIndex: 2, symbol: 'PLUM', matchLength: 3 },
    ]);
  });

  it('does not substitute a differing symbol into an otherwise-matching run', () => {
    const grid = makeGrid({ '0,1': 'BAR', '1,1': 'BAR', '2,1': 'WILD' });
    expect(evaluateWinLines(grid)).toEqual([]);
  });

  it('includes line index and the winning symbol combination for a 4-run', () => {
    const grid = makeGrid({ '0,1': 'SEVEN', '1,1': 'SEVEN', '2,1': 'SEVEN', '3,1': 'SEVEN' });
    const winners = evaluateWinLines(grid);
    expect(winners).toEqual([{ lineIndex: 0, symbol: 'SEVEN', matchLength: 4 }]);
    expect(winners[0]).toHaveProperty('lineIndex');
    expect(winners[0]).toHaveProperty('symbol');
    expect(winners[0]).toHaveProperty('matchLength');
  });
});
