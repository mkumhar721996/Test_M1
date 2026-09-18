import { calculatePayout } from './payout.ts';

export interface WinningLineInput {
  lineIndex: number;
  basePayout: number;
}

export interface WinningLineResult {
  lineIndex: number;
  basePayout: number;
  creditAward: number;
}

export interface SpinResultInput {
  seed: string;
  reelStops: number[];
  betLevel: number;
  winningLines: WinningLineInput[];
}

export interface SpinResultPayload {
  seed: string;
  reelStops: number[];
  winningLines: WinningLineResult[];
  totalCreditsWon: number;
}

export function assembleSpinResult(input: SpinResultInput): SpinResultPayload {
  const winningLines = [...input.winningLines]
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .map((line) => ({
      lineIndex: line.lineIndex,
      basePayout: line.basePayout,
      creditAward: calculatePayout(line.basePayout, input.betLevel),
    }));

  const totalCreditsWon = winningLines.reduce((sum, line) => sum + line.creditAward, 0);

  return {
    seed: input.seed,
    reelStops: input.reelStops,
    winningLines,
    totalCreditsWon,
  };
}
