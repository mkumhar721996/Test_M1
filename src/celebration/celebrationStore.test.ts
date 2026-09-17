import { describe, expect, it } from 'vitest';
import { createCelebrationStore } from './celebrationStore';
import type { WinningLine } from './types';

const middleRow: WinningLine = {
  id: 'line-2',
  name: 'Middle Row',
  symbol: '7️⃣',
  amount: 12.5,
  positions: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
};

const topRow: WinningLine = {
  id: 'line-1',
  name: 'Top Row',
  symbol: '🔔',
  amount: 5.0,
  positions: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
};

const bottomRow: WinningLine = {
  id: 'line-3',
  name: 'Bottom Row',
  symbol: '💎',
  amount: 15.0,
  positions: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
};

describe('createCelebrationStore', () => {
  it('starts in idle state with no winning lines and no total win', () => {
    const store = createCelebrationStore();
    expect(store.getState()).toBe('idle');
    expect(store.getWinningLines()).toEqual([]);
    expect(store.getTotalWin()).toBe(0);
  });

  it('AC1/AC2: settling a payload with winning lines moves to celebrating and stores lines/total', () => {
    const store = createCelebrationStore();
    store.settle({ winningLines: [middleRow], totalWin: 12.5 });
    expect(store.getState()).toBe('celebrating');
    expect(store.getWinningLines()).toEqual([middleRow]);
    expect(store.getTotalWin()).toBe(12.5);
  });

  it('AC1/AC2: settling a payload with multiple winning lines keeps every line', () => {
    const store = createCelebrationStore();
    store.settle({ winningLines: [topRow, bottomRow], totalWin: 20.0 });
    expect(store.getState()).toBe('celebrating');
    expect(store.getWinningLines()).toEqual([topRow, bottomRow]);
    expect(store.getTotalWin()).toBe(20.0);
  });

  it('AC3/AC4: settling a payload with no winning lines stays idle with cleared lines/total', () => {
    const store = createCelebrationStore();
    store.settle({ winningLines: [], totalWin: 0 });
    expect(store.getState()).toBe('idle');
    expect(store.getWinningLines()).toEqual([]);
    expect(store.getTotalWin()).toBe(0);
  });

  it('AC6: starting a new spin after a win returns the state to idle', () => {
    const store = createCelebrationStore();
    store.settle({ winningLines: [topRow, bottomRow], totalWin: 20.0 });
    expect(store.getState()).toBe('celebrating');
    store.startNewSpin();
    expect(store.getState()).toBe('idle');
  });

  it('AC5: starting a new spin clears winning lines and total win', () => {
    const store = createCelebrationStore();
    store.settle({ winningLines: [middleRow], totalWin: 12.5 });
    store.startNewSpin();
    expect(store.getWinningLines()).toEqual([]);
    expect(store.getTotalWin()).toBe(0);
  });
});
