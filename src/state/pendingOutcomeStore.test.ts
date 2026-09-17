import { describe, it, expect, beforeEach } from 'vitest';
import { savePendingOutcome, loadPendingOutcome, clearPendingOutcome } from './pendingOutcomeStore';

describe('pendingOutcomeStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns null when nothing has been saved', () => {
    expect(loadPendingOutcome()).toBeNull();
  });

  it('preserves a spin result that resolved server-side so it can be reloaded later', () => {
    const result = { spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 };
    savePendingOutcome(result);

    expect(loadPendingOutcome()).toEqual(result);
  });

  it('clears the persisted outcome once it has been consumed', () => {
    savePendingOutcome({ spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 0 });
    clearPendingOutcome();

    expect(loadPendingOutcome()).toBeNull();
  });
});
