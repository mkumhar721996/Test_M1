export type GameState = 'idle' | 'celebrating';

export interface WinningLine {
  id: string;
  name: string;
  symbol: string;
  amount: number;
  positions: Array<[number, number]>;
}

export interface EngineResultPayload {
  winningLines: WinningLine[];
  totalWin: number;
}
