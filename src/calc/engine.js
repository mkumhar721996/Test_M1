class MalformedExpressionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MalformedExpressionError';
  }
}

class DivideByZeroError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DivideByZeroError';
  }
}

class OverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OverflowError';
  }
}

const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(expression) {
  const tokens = [];
  const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|([+\-*/^()]))/y;
  let pos = 0;
  while (pos < expression.length) {
    if (/^\s*$/.test(expression.slice(pos))) break;
    pattern.lastIndex = pos;
    const m = pattern.exec(expression);
    if (!m) {
      throw new MalformedExpressionError(`Unexpected character at position ${pos}`);
    }
    if (m[1] !== undefined) tokens.push({ type: 'NUMBER', value: parseFloat(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'IDENTIFIER', value: m[2] });
    else tokens.push({ type: 'OP', value: m[3] });
    pos = pattern.lastIndex;
  }
  return tokens;
}

function peekOp(state, ops) {
  const t = state.tokens[state.pos];
  return t && t.type === 'OP' && ops.includes(t.value) ? t.value : null;
}

function parseExpression(state) {
  let left = parseTerm(state);
  let op;
  while ((op = peekOp(state, ['+', '-']))) {
    state.pos++;
    const right = parseTerm(state);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(state) {
  let left = parsePower(state);
  let op;
  while ((op = peekOp(state, ['*', '/']))) {
    state.pos++;
    const right = parsePower(state);
    if (op === '/') {
      if (right === 0) throw new DivideByZeroError('Division by zero');
      left /= right;
    } else {
      left *= right;
    }
  }
  return left;
}

function parsePower(state) {
  const base = parsePrimary(state);
  if (peekOp(state, ['^'])) {
    state.pos++;
    return Math.pow(base, parsePower(state));
  }
  return base;
}

function parsePrimary(state) {
  const t = state.tokens[state.pos++];
  if (!t) throw new MalformedExpressionError('Unexpected end of expression');
  if (t.type === 'NUMBER') return t.value;
  if (t.type === 'IDENTIFIER' && Object.hasOwn(CONSTANTS, t.value)) {
    return CONSTANTS[t.value];
  }
  if (t.type === 'OP' && t.value === '(') {
    const value = parseExpression(state);
    if (!peekOp(state, [')'])) throw new MalformedExpressionError('Missing closing parenthesis');
    state.pos++;
    return value;
  }
  throw new MalformedExpressionError(`Unexpected token '${t.value}'`);
}

function evaluate(expression) {
  const tokens = tokenize(String(expression));
  if (tokens.length === 0) throw new MalformedExpressionError('Empty expression');
  const state = { tokens, pos: 0 };
  const result = parseExpression(state);
  if (state.pos < tokens.length) {
    throw new MalformedExpressionError(`Unexpected token '${tokens[state.pos].value}'`);
  }
  if (!Number.isFinite(result)) throw new OverflowError('Result exceeds representable range');
  return result;
}

module.exports = { evaluate, MalformedExpressionError, DivideByZeroError, OverflowError };
