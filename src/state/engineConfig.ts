export interface EngineSymbol {
  id: string;
  name: string;
  payoutPerLine: Record<number, number>;
}

export interface PaylineDef {
  id: string;
  positions: number[];
  description: string;
}

export interface EngineConfig {
  symbols: EngineSymbol[];
  paylines: PaylineDef[];
}

function isValidSymbol(symbol: unknown): symbol is EngineSymbol {
  const candidate = symbol as EngineSymbol;
  return (
    candidate != null &&
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.payoutPerLine != null &&
    typeof candidate.payoutPerLine === 'object'
  );
}

function isValidPayline(payline: unknown): payline is PaylineDef {
  const candidate = payline as PaylineDef;
  return (
    candidate != null &&
    typeof candidate.id === 'string' &&
    Array.isArray(candidate.positions) &&
    typeof candidate.description === 'string'
  );
}

export function loadEngineConfig(raw: unknown): EngineConfig | null {
  if (raw == null || typeof raw !== 'object') return null;

  const { symbols, paylines } = raw as { symbols?: unknown; paylines?: unknown };
  if (!Array.isArray(symbols) || symbols.length === 0) return null;
  if (!Array.isArray(paylines) || paylines.length === 0) return null;
  if (!symbols.every(isValidSymbol)) return null;
  if (!paylines.every(isValidPayline)) return null;

  return { symbols, paylines };
}

export function scalePayout(payoutMultiplier: number, betPerLine: number): number {
  return payoutMultiplier * betPerLine;
}
