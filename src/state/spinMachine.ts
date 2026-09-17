import type { SpinResult } from '../engine/engineClient';

export type SpinStatus = 'idle' | 'spinning' | 'frozen-error' | 'retrying' | 'complete';

export interface SpinState {
  status: SpinStatus;
  spinId: string | null;
  reelPositions: number[];
  result: SpinResult | null;
  errorMessage: string | null;
}

export type SpinEvent =
  | { type: 'SPIN_REQUESTED'; spinId: string }
  | { type: 'REEL_TICK'; positions: number[] }
  | { type: 'ENGINE_ERROR'; message: string }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'ENGINE_RESOLVED'; result: SpinResult }
  | { type: 'HYDRATE_FROM_PENDING'; result: SpinResult };

export const initialSpinState: SpinState = {
  status: 'idle',
  spinId: null,
  reelPositions: [],
  result: null,
  errorMessage: null,
};

export function spinReducer(state: SpinState, event: SpinEvent): SpinState {
  switch (event.type) {
    case 'SPIN_REQUESTED':
      return {
        status: 'spinning',
        spinId: event.spinId,
        reelPositions: state.reelPositions,
        result: null,
        errorMessage: null,
      };
    case 'REEL_TICK':
      if (state.status !== 'spinning') {
        return state;
      }
      return { ...state, reelPositions: event.positions };
    case 'ENGINE_ERROR':
      return { ...state, status: 'frozen-error', errorMessage: event.message };
    case 'RETRY_REQUESTED':
      return { ...state, status: 'retrying', errorMessage: null };
    case 'ENGINE_RESOLVED':
      return {
        ...state,
        status: 'complete',
        result: event.result,
        reelPositions: event.result.reelPositions,
        errorMessage: null,
      };
    case 'HYDRATE_FROM_PENDING':
      return {
        status: 'complete',
        spinId: event.result.spinId,
        reelPositions: event.result.reelPositions,
        result: event.result,
        errorMessage: null,
      };
    default:
      return state;
  }
}
