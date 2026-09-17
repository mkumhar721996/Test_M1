import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSpinController } from './useSpinController';
import { savePendingOutcome, loadPendingOutcome } from './pendingOutcomeStore';
import type { EngineClient } from '../engine/engineClient';

describe('useSpinController', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts in idle state when nothing has resolved server-side', () => {
    const engineClient: EngineClient = {
      requestSpin: vi.fn(),
      retrySpin: vi.fn(),
    };

    const { result } = renderHook(() => useSpinController(engineClient));

    expect(result.current.state.status).toBe('idle');
  });

  it('freezes with an error message when the engine request fails mid-spin', async () => {
    const engineClient: EngineClient = {
      requestSpin: vi.fn().mockRejectedValue(new Error('network drop')),
      retrySpin: vi.fn(),
    };

    const { result } = renderHook(() => useSpinController(engineClient));
    await act(() => result.current.spin());

    expect(result.current.state.status).toBe('frozen-error');
    expect(result.current.state.errorMessage).toBeTruthy();
  });

  it('resumes and completes the spin from the frozen state when retry succeeds', async () => {
    const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 0 };
    const engineClient: EngineClient = {
      requestSpin: vi.fn().mockRejectedValue(new Error('network drop')),
      retrySpin: vi.fn().mockResolvedValue(result),
    };

    const { result: hook } = renderHook(() => useSpinController(engineClient));
    await act(() => hook.current.spin());
    expect(hook.current.state.status).toBe('frozen-error');

    await act(() => hook.current.retry());

    expect(engineClient.retrySpin).toHaveBeenCalledWith(expect.any(String));
    expect(hook.current.state.status).toBe('complete');
    expect(hook.current.state.result).toEqual(result);
  });

  it('returns to idle state after reload when no spin resolved server-side', () => {
    const engineClient: EngineClient = {
      requestSpin: vi.fn(),
      retrySpin: vi.fn(),
    };

    const { result } = renderHook(() => useSpinController(engineClient));

    expect(result.current.state.status).toBe('idle');
  });

  it('preserves a spin result that resolved server-side after the error but before reload', () => {
    savePendingOutcome({ spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 });
    const engineClient: EngineClient = {
      requestSpin: vi.fn(),
      retrySpin: vi.fn(),
    };

    const { result: hook } = renderHook(() => useSpinController(engineClient));

    expect(hook.current.state.status).toBe('complete');
    expect(hook.current.state.result).toEqual({ spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 });
    expect(loadPendingOutcome()).toBeNull();
  });

  it('persists the resolved result to storage as soon as the engine responds, even mid-error', async () => {
    const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 10 };
    const engineClient: EngineClient = {
      requestSpin: vi.fn().mockRejectedValue(new Error('drop')),
      retrySpin: vi.fn().mockResolvedValue(result),
    };

    const { result: hook } = renderHook(() => useSpinController(engineClient));
    await act(() => hook.current.spin());
    await act(() => hook.current.retry());

    expect(sessionStorage.getItem('engine-pending-outcome')).not.toBeNull();
  });
});
