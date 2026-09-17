function isValidSymbol(symbol) {
  return (
    symbol != null &&
    typeof symbol.id === 'string' &&
    typeof symbol.name === 'string' &&
    symbol.payoutPerLine != null &&
    typeof symbol.payoutPerLine === 'object'
  );
}

function isValidPayline(payline) {
  return (
    payline != null &&
    typeof payline.id === 'string' &&
    Array.isArray(payline.positions) &&
    typeof payline.description === 'string'
  );
}

export function loadEngineConfig(raw) {
  if (raw == null || typeof raw !== 'object') return null;

  const { symbols, paylines } = raw;
  if (!Array.isArray(symbols) || symbols.length === 0) return null;
  if (!Array.isArray(paylines) || paylines.length === 0) return null;
  if (!symbols.every(isValidSymbol)) return null;
  if (!paylines.every(isValidPayline)) return null;

  return { symbols, paylines };
}

export function scalePayout(payoutMultiplier, betPerLine) {
  return payoutMultiplier * betPerLine;
}
