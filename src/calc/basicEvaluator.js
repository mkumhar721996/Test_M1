class DivisionByZeroError extends Error {
  constructor(message = 'Division by zero') {
    super(message);
    this.name = 'DivisionByZeroError';
  }
}

class InvalidExpressionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidExpressionError';
  }
}

const TOKEN_RE = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([+\-*/]))/y;

function tokenize(expression) {
  const tokens = [];
  const src = String(expression);
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(src);
    if (!m) {
      throw new InvalidExpressionError(`Unexpected character at position ${pos}`);
    }
    tokens.push(m[1] !== undefined ? { type: 'NUMBER', value: Number(m[1]) } : { type: 'OP', value: m[2] });
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

function evaluate(expression) {
  const tokens = tokenize(expression);
  let i = 0;

  function parseFactor() {
    let sign = 1;
    if (i === 0 && tokens[i] && tokens[i].type === 'OP' && tokens[i].value === '-') {
      sign = -1;
      i++;
    }
    const tok = tokens[i];
    if (!tok) throw new InvalidExpressionError('Missing operand');
    if (tok.type === 'OP') {
      throw new InvalidExpressionError(`Consecutive operators: unexpected '${tok.value}'`);
    }
    i++;
    return sign * tok.value;
  }

  function parseTerm() {
    let left = parseFactor();
    while (tokens[i] && (tokens[i].value === '*' || tokens[i].value === '/')) {
      const op = tokens[i++].value;
      const right = parseFactor();
      if (op === '/' && right === 0) throw new DivisionByZeroError();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseExpression() {
    let left = parseTerm();
    while (tokens[i] && (tokens[i].value === '+' || tokens[i].value === '-')) {
      const op = tokens[i++].value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseExpression();
  if (i < tokens.length) throw new InvalidExpressionError('Unexpected token after expression');
  return result;
}

module.exports = { evaluate, DivisionByZeroError, InvalidExpressionError };
