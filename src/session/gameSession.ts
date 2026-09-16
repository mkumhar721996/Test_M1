export const MIN_BET = 10;
export const DEFAULT_BALANCE = 1000;

export interface SessionState {
  balance: number;
  bet: number;
  lastBet: number | null;
  winTotal: number;
  spinHistory: number[];
}

export function createInitialSession(): SessionState {
  return {
    balance: DEFAULT_BALANCE,
    bet: MIN_BET,
    lastBet: null,
    winTotal: 0,
    spinHistory: [],
  };
}

export function applySpinResult(state: SessionState, netDelta: number): SessionState {
  const wager = state.bet;
  const spinHistory = [netDelta, ...state.spinHistory].slice(0, 5);
  return {
    ...state,
    balance: state.balance + netDelta,
    lastBet: wager,
    winTotal: state.winTotal + Math.max(netDelta, 0),
    spinHistory,
  };
}

export function isBelowMinBet(state: SessionState): boolean {
  return state.balance < MIN_BET;
}
