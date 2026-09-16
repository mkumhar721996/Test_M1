import { ConfigValidationError } from './errors.js';

export function validateConfig(config) {
  const { grid, symbols, reelStrips, paylines, betLevels } = config;

  if (grid.reels <= 0) {
    throw new ConfigValidationError(`invalid grid dimension: reels must be positive, got ${grid.reels}`);
  }
  if (grid.rows <= 0) {
    throw new ConfigValidationError(`invalid grid dimension: rows must be positive, got ${grid.rows}`);
  }

  const seenSymbolIds = new Set();
  for (const symbol of symbols) {
    if (seenSymbolIds.has(symbol.id)) {
      throw new ConfigValidationError(`duplicate symbol identifier: ${symbol.id}`);
    }
    seenSymbolIds.add(symbol.id);
    if (symbol.basePayout < 0) {
      throw new ConfigValidationError(`invalid symbol payout: symbol ${symbol.id} has a negative base payout (${symbol.basePayout})`);
    }
  }

  reelStrips.forEach((strip, reelIndex) => {
    if (strip.length === 0) {
      throw new ConfigValidationError(`reel ${reelIndex} strip is empty`);
    }
    if (strip.length < grid.rows) {
      throw new ConfigValidationError(
        `reel ${reelIndex} has ${strip.length} positions, fewer than the required ${grid.rows}`,
      );
    }
    for (const symbolId of strip) {
      if (!seenSymbolIds.has(symbolId)) {
        throw new ConfigValidationError(`reel ${reelIndex} references undefined symbol: ${symbolId}`);
      }
    }
  });

  for (const payline of paylines) {
    if (payline.positions.length !== grid.reels) {
      throw new ConfigValidationError(
        `payline ${payline.id} has ${payline.positions.length} positions, expected ${grid.reels}`,
      );
    }
    for (const row of payline.positions) {
      if (row < 0 || row >= grid.rows) {
        throw new ConfigValidationError(`payline ${payline.id} references row ${row} outside the configured grid`);
      }
    }
  }

  for (const betLevel of betLevels) {
    if (betLevel <= 0) {
      throw new ConfigValidationError(`invalid bet level: bet levels must be positive, got ${betLevel}`);
    }
  }
}
