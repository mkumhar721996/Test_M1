import { useCallback, useRef, useState } from 'react';
import type { EngineClient, SpinResult } from '../engine/engineClient';
import { spinReducer, initialSpinState, type SpinState, type SpinEvent } from './spinMachine';
import { loadPendingOutcome, savePendingOutcome, clearPendingOutcome } from './pendingOutcomeStore';

export const ENGINE_ERROR_MESSAGE = 'Something went wrong completing your spin.';

function createSpinId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hydrateInitialState(): SpinState {
  const pending = loadPendingOutcome();
  if (!pending) {
    return initialSpinState;
  }
  clearPendingOutcome();
  return spinReducer(initialSpinState, { type: 'HYDRATE_FROM_PENDING', result: pending });
}

export interface SpinController {
  state: SpinState;
  spin: () => Promise<void>;
  retry: () => Promise<void>;
  reload: () => void;
}

export function useSpinController(engineClient: EngineClient): SpinController {
  const [state, setState] = useState<SpinState>(hydrateInitialState);
  const spinIdRef = useRef<string | null>(null);

  const dispatch = useCallback((event: SpinEvent) => {
    setState((prev) => spinReducer(prev, event));
  }, []);

  const runEngineCall = useCallback(
    async (call: () => Promise<SpinResult>) => {
      try {
        const result = await call();
        savePendingOutcome(result);
        dispatch({ type: 'ENGINE_RESOLVED', result });
      } catch {
        dispatch({ type: 'ENGINE_ERROR', message: ENGINE_ERROR_MESSAGE });
      }
    },
    [dispatch],
  );

  const spin = useCallback(async () => {
    const spinId = createSpinId();
    spinIdRef.current = spinId;
    dispatch({ type: 'SPIN_REQUESTED', spinId });
    await runEngineCall(() => engineClient.requestSpin());
  }, [dispatch, engineClient, runEngineCall]);

  const retry = useCallback(async () => {
    const spinId = spinIdRef.current;
    if (!spinId) {
      return;
    }
    dispatch({ type: 'RETRY_REQUESTED' });
    await runEngineCall(() => engineClient.retrySpin(spinId));
  }, [dispatch, engineClient, runEngineCall]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { state, spin, retry, reload };
}
