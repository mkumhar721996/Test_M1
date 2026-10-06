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

class TrigDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrigDomainError';
  }
}

class LogarithmDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LogarithmDomainError';
  }
}

class RootDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RootDomainError';
  }
}

class FactorialDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FactorialDomainError';
  }
}

const CONSTANTS = { pi: Math.PI, e: Math.E };

const UNARY_FUNCTIONS = new Set([
  'sin', 'cos', 'tan',
  'asin', 'arcsin', 'acos', 'arccos', 'atan', 'arctan',
  'ln', 'log', 'exp', 'sqrt', 'cbrt',
]);
const BINARY_FUNCTIONS = new Set(['root']);
const FUNCTION_NAMES = new Set([...UNARY_FUNCTIONS, ...BINARY_FUNCTIONS]);

function toRadians(x, angleMode) {
  return angleMode === 'degrees' ? (x * Math.PI) / 180 : x;
}

function fromRadians(x, angleMode) {
  return angleMode === 'degrees' ? (x * 180) / Math.PI : x;
}

function nthRoot(x, n) {
  if (n % 2 === 0 && x < 0) {
    throw new RootDomainError(`Even root (index ${n}) is undefined for negative numbers, got ${x}`);
  }
  return x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new FactorialDomainError(`Factorial is only defined for non-negative integers, got ${n}`);
  }
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function applyFunction(name, args, angleMode) {
  const x = args[0];
  switch (name) {
    case 'sin': return Math.sin(toRadians(x, angleMode));
    case 'cos': return Math.cos(toRadians(x, angleMode));
    case 'tan': return Math.tan(toRadians(x, angleMode));
    case 'asin':
    case 'arcsin':
      if (x < -1 || x > 1) throw new TrigDomainError(`arcsin domain is [-1, 1], got ${x}`);
      return fromRadians(Math.asin(x), angleMode);
    case 'acos':
    case 'arccos':
      if (x < -1 || x > 1) throw new TrigDomainError(`arccos domain is [-1, 1], got ${x}`);
      return fromRadians(Math.acos(x), angleMode);
    case 'atan':
    case 'arctan':
      return fromRadians(Math.atan(x), angleMode);
    case 'ln':
      if (x <= 0) throw new LogarithmDomainError(`ln is only defined for positive numbers, got ${x}`);
      return Math.log(x);
    case 'log':
      if (x <= 0) throw new LogarithmDomainError(`log is only defined for positive numbers, got ${x}`);
      return Math.log10(x);
    case 'exp': return Math.exp(x);
    case 'sqrt':
      if (x < 0) throw new RootDomainError(`Square root is undefined for negative numbers, got ${x}`);
      return Math.sqrt(x);
    case 'cbrt': return Math.cbrt(x);
    case 'root': return nthRoot(x, args[1]);
    default: throw new MalformedExpressionError(`Unknown function '${name}'`);
  }
}

function tokenize(expression) {
  const tokens = [];
  const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|([+\-*/^(),!]))/y;
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
  const base = parseFactorial(state);
  if (peekOp(state, ['^'])) {
    state.pos++;
    return Math.pow(base, parsePower(state));
  }
  return base;
}

function parseFactorial(state) {
  let value = parsePrimary(state);
  while (peekOp(state, ['!'])) {
    state.pos++;
    value = factorial(value);
  }
  return value;
}

function parseFunctionCall(state, name) {
  state.pos++; // consume '('
  const args = [parseExpression(state)];
  while (peekOp(state, [','])) {
    state.pos++;
    args.push(parseExpression(state));
  }
  if (!peekOp(state, [')'])) throw new MalformedExpressionError('Missing closing parenthesis');
  state.pos++;
  const expectedArity = BINARY_FUNCTIONS.has(name) ? 2 : 1;
  if (args.length !== expectedArity) {
    throw new MalformedExpressionError(`Function '${name}' expects ${expectedArity} argument(s), got ${args.length}`);
  }
  return applyFunction(name, args, state.angleMode);
}

function parsePrimary(state) {
  const t = state.tokens[state.pos++];
  if (!t) throw new MalformedExpressionError('Unexpected end of expression');
  if (t.type === 'NUMBER') return t.value;
  if (t.type === 'IDENTIFIER' && FUNCTION_NAMES.has(t.value)) {
    if (!peekOp(state, ['('])) throw new MalformedExpressionError(`Expected '(' after function '${t.value}'`);
    return parseFunctionCall(state, t.value);
  }
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

function evaluate(expression, options = {}) {
  const angleMode = options.angleMode === 'degrees' ? 'degrees' : 'radians';
  const tokens = tokenize(String(expression));
  if (tokens.length === 0) throw new MalformedExpressionError('Empty expression');
  const state = { tokens, pos: 0, angleMode };
  const result = parseExpression(state);
  if (state.pos < tokens.length) {
    throw new MalformedExpressionError(`Unexpected token '${tokens[state.pos].value}'`);
  }
  if (!Number.isFinite(result)) throw new OverflowError('Result exceeds representable range');
  return result;
}

module.exports = {
  evaluate,
  MalformedExpressionError, DivideByZeroError, OverflowError,
  TrigDomainError,
  LogarithmDomainError,
  RootDomainError,
  FactorialDomainError,
};
