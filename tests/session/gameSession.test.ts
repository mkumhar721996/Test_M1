import { describe, expect, it } from 'vitest';
import {
  MIN_BET,
  DEFAULT_BALANCE,
  createInitialSession,
  applySpinResult,
  isBelowMinBet,
} from '../../src/session/gameSession';

describe('gameSession', () => {
  it('creates an initial session with the default balance and empty ancillary state', () => {
    const state = createInitialSession();
    expect(state.balance).toBe(DEFAULT_BALANCE);
    expect(state.bet).toBe(MIN_BET);
    expect(state.lastBet).toBeNull();
    expect(state.winTotal).toBe(0);
    expect(state.spinHistory).toEqual([]);
  });

  it('applies a losing spin result by reducing the balance and recording history', () => {
    const state = { ...createInitialSession(), balance: 20, bet: 10 };
    const next = applySpinResult(state, -10);
    expect(next.balance).toBe(10);
    expect(next.lastBet).toBe(10);
    expect(next.spinHistory).toEqual([-10]);
    expect(next.winTotal).toBe(0);
  });

  it('applies a winning spin result by increasing balance and win total', () => {
    const state = { ...createInitialSession(), balance: 20, bet: 10 };
    const next = applySpinResult(state, 40);
    expect(next.balance).toBe(60);
    expect(next.winTotal).toBe(40);
    expect(next.spinHistory).toEqual([40]);
  });

  it('reports below-min-bet once balance drops under the minimum bet', () => {
    expect(isBelowMinBet({ ...createInitialSession(), balance: 10 })).toBe(false);
    expect(isBelowMinBet({ ...createInitialSession(), balance: 9 })).toBe(true);
    expect(isBelowMinBet({ ...createInitialSession(), balance: 0 })).toBe(true);
  });
});
