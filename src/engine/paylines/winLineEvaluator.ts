import { PAY_LINES } from './paylines.config';
import type { PayLine, SymbolGrid, WinningLine } from './types';

export function evaluateWinLines(
  symbolGrid: SymbolGrid,
  payLines: readonly PayLine[] = PAY_LINES,
): WinningLine[] {
  const winners: WinningLine[] = [];
  payLines.forEach((rowsPerReel, lineIndex) => {
    const sequence = rowsPerReel.map((row, reel) => symbolGrid[reel][row]);
    const firstSymbol = sequence[0];
    let matchLength = 1;
    while (matchLength < sequence.length && sequence[matchLength] === firstSymbol) {
      matchLength += 1;
    }
    if (matchLength >= 3) {
      winners.push({ lineIndex, symbol: firstSymbol, matchLength });
    }
  });
  return winners;
}
