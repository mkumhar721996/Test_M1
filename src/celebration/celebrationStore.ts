import type { EngineResultPayload, GameState, WinningLine } from './types';

export interface CelebrationStore {
  getState(): GameState;
  getWinningLines(): WinningLine[];
  getTotalWin(): number;
  settle(payload: EngineResultPayload): void;
  startNewSpin(): void;
}

export function createCelebrationStore(): CelebrationStore {
  let state: GameState = 'idle';
  let winningLines: WinningLine[] = [];
  let totalWin = 0;

  return {
    getState: () => state,
    getWinningLines: () => winningLines,
    getTotalWin: () => totalWin,
    settle(payload: EngineResultPayload) {
      if (payload.winningLines.length > 0) {
        state = 'celebrating';
        winningLines = payload.winningLines;
        totalWin = payload.totalWin;
      } else {
        state = 'idle';
        winningLines = [];
        totalWin = 0;
      }
    },
    startNewSpin() {
      state = 'idle';
      winningLines = [];
      totalWin = 0;
    },
  };
}
