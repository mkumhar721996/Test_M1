import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameControls } from './useGameControls';

describe('useGameControls', () => {
  it('enables spin when idle and the bet is affordable', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 100, betOptions: [10, 25, 50], initialBet: 25 })
    );
    expect(result.current.state.disabledReason).toBeNull();
  });

  it('disables spin for an unaffordable initial bet', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 10, betOptions: [10, 25, 50], initialBet: 25 })
    );
    expect(result.current.state.disabledReason).toBe('insufficient-balance');
  });

  it('disables spin immediately when the new bet exceeds the wallet balance', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 50, betOptions: [10, 25, 50], initialBet: 25 })
    );
    act(() => result.current.actions.setBetAmount(50));
    act(() => result.current.actions.setBetAmount(75));
    expect(result.current.state.disabledReason).toBe('insufficient-balance');
  });

  it('locks the reels and disables spin while in-flight', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 100, betOptions: [10, 25], initialBet: 25 })
    );
    act(() => result.current.actions.startSpin());
    expect(result.current.state.disabledReason).toBe('in-flight');
    expect(result.current.state.reelsLocked).toBe(true);
  });

  it('re-enables spin after a result if the bet is still affordable', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 100, betOptions: [10, 25], initialBet: 25 })
    );
    act(() => result.current.actions.startSpin());
    expect(result.current.state.disabledReason).toBe('in-flight');
    act(() => result.current.actions.completeSpin());
    expect(result.current.state.disabledReason).toBeNull();
  });

  it('unlocks the reels once a result is received', () => {
    const { result } = renderHook(() =>
      useGameControls({ walletBalance: 100, betOptions: [10], initialBet: 10 })
    );
    act(() => result.current.actions.startSpin());
    expect(result.current.state.reelsLocked).toBe(true);
    act(() => result.current.actions.completeSpin());
    expect(result.current.state.reelsLocked).toBe(false);
  });
});
