import { useState } from 'react';

export type SpinStatus = 'idle' | 'in-flight';
export type DisabledReason = 'insufficient-balance' | 'in-flight' | null;

export interface GameControlsConfig {
  walletBalance: number;
  betOptions: number[];
  initialBet: number;
}

export interface GameControlsState {
  betAmount: number;
  disabledReason: DisabledReason;
  reelsLocked: boolean;
}

export interface GameControlsActions {
  setBetAmount: (amount: number) => void;
  startSpin: () => void;
  completeSpin: () => void;
}

export interface GameControls {
  state: GameControlsState;
  actions: GameControlsActions;
}

function resolveInitialBet(config: GameControlsConfig): number {
  if (config.initialBet <= config.walletBalance) {
    return config.initialBet;
  }
  const affordableOptions = config.betOptions.filter((amount) => amount <= config.walletBalance);
  return affordableOptions.length > 0 ? Math.max(...affordableOptions) : config.initialBet;
}

export function useGameControls(config: GameControlsConfig): GameControls {
  const [betAmount, setBetAmount] = useState(() => resolveInitialBet(config));
  const [spinStatus, setSpinStatus] = useState<SpinStatus>('idle');

  const disabledReason: DisabledReason =
    spinStatus === 'in-flight'
      ? 'in-flight'
      : betAmount > config.walletBalance
        ? 'insufficient-balance'
        : null;

  return {
    state: {
      betAmount,
      disabledReason,
      reelsLocked: spinStatus === 'in-flight',
    },
    actions: {
      setBetAmount,
      startSpin: () => setSpinStatus('in-flight'),
      completeSpin: () => setSpinStatus('idle'),
    },
  };
}
