import { describe, it, expect } from 'vitest';
import { spinReducer, initialSpinState } from './spinMachine';

describe('spinReducer', () => {
  it('freezes reel positions immediately when the engine reports an error mid-spin', () => {
    let state = spinReducer(initialSpinState, { type: 'SPIN_REQUESTED', spinId: 'spin-1' });
    state = spinReducer(state, { type: 'REEL_TICK', positions: [12, 34, 56] });
    state = spinReducer(state, { type: 'ENGINE_ERROR', message: 'Spin failed to resolve.' });

    expect(state.status).toBe('frozen-error');
    expect(state.reelPositions).toEqual([12, 34, 56]);
    expect(state.errorMessage).toBe('Spin failed to resolve.');
  });

  it('ignores reel ticks once frozen so the position cannot drift after the error', () => {
    let state = spinReducer(initialSpinState, { type: 'SPIN_REQUESTED', spinId: 'spin-1' });
    state = spinReducer(state, { type: 'REEL_TICK', positions: [12, 34, 56] });
    state = spinReducer(state, { type: 'ENGINE_ERROR', message: 'boom' });
    state = spinReducer(state, { type: 'REEL_TICK', positions: [99, 99, 99] });

    expect(state.reelPositions).toEqual([12, 34, 56]);
  });

  it('moves to retrying when a retry is requested from the frozen state', () => {
    let state = spinReducer(initialSpinState, { type: 'SPIN_REQUESTED', spinId: 'spin-1' });
    state = spinReducer(state, { type: 'ENGINE_ERROR', message: 'boom' });
    state = spinReducer(state, { type: 'RETRY_REQUESTED' });

    expect(state.status).toBe('retrying');
    expect(state.errorMessage).toBeNull();
  });

  it('resumes and completes the spin once the engine resolves after a retry', () => {
    const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 0 };
    let state = spinReducer(initialSpinState, { type: 'SPIN_REQUESTED', spinId: 'spin-1' });
    state = spinReducer(state, { type: 'ENGINE_ERROR', message: 'boom' });
    state = spinReducer(state, { type: 'RETRY_REQUESTED' });
    state = spinReducer(state, { type: 'ENGINE_RESOLVED', result });

    expect(state.status).toBe('complete');
    expect(state.result).toEqual(result);
  });

  it('hydrates directly into complete from a pending outcome', () => {
    const result = { spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 };
    const state = spinReducer(initialSpinState, { type: 'HYDRATE_FROM_PENDING', result });

    expect(state.status).toBe('complete');
    expect(state.result).toEqual(result);
    expect(state.reelPositions).toEqual([7, 8, 9]);
  });
});
