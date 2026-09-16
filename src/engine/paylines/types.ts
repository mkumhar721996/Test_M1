export type SymbolId = string;

// symbolGrid[reelIndex][rowIndex] — the symbol already placed at that position,
// derived from reel stops by the (separate) symbol-placement logic.
export type SymbolGrid = readonly SymbolId[][];

// one row index per reel, e.g. [1,1,1,1,1] is the straight middle-row line
export type PayLine = readonly number[];

export interface WinningLine {
  lineIndex: number;
  symbol: SymbolId;
  matchLength: number;
}
