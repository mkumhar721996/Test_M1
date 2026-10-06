const {
  evaluate,
  DivideByZeroError,
  OverflowError,
  MalformedExpressionError,
  TrigDomainError,
  LogarithmDomainError,
  RootDomainError,
  FactorialDomainError,
} = require('../src/calc/engine');

test('AC1: respects */^ over + with right-associative exponentiation', () => {
  expect(evaluate('2 + 3 * 4 ^ 2')).toBe(50);
  expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
});

test('AC2: parentheses override default precedence', () => {
  expect(evaluate('(2 + 3) * 4')).toBe(20);
});

test('AC3: division and subtraction evaluate left-to-right at their precedence', () => {
  expect(evaluate('20 / 4 - 2')).toBe(3);
});

test('AC4: division and multiplication are left-associative at the same precedence', () => {
  expect(evaluate('20 / 4 * 2')).toBe(10);
});

test('AC5: the constant pi is recognized and usable in arithmetic', () => {
  expect(evaluate('2 * pi')).toBe(2 * Math.PI);
});

test('AC6: the constant e is recognized and usable in arithmetic', () => {
  expect(evaluate('e + 1')).toBe(Math.E + 1);
});

test('AC7: division by zero throws a distinct DivideByZeroError', () => {
  expect(() => evaluate('5 / 0')).toThrow(DivideByZeroError);
  expect(() => evaluate('5 / 0')).not.toThrow(OverflowError);
  expect(() => evaluate('5 / 0')).not.toThrow(MalformedExpressionError);
});

test('AC8: a result exceeding double-precision range throws a distinct OverflowError', () => {
  expect(() => evaluate('10 ^ 1000')).toThrow(OverflowError);
  expect(() => evaluate('10 ^ 1000')).not.toThrow(DivideByZeroError);
  expect(() => evaluate('10 ^ 1000')).not.toThrow(MalformedExpressionError);
});

test('AC9: a malformed expression throws a distinct MalformedExpressionError', () => {
  expect(() => evaluate('2 + * 3')).toThrow(MalformedExpressionError);
  expect(() => evaluate('2 + * 3')).not.toThrow(DivideByZeroError);
  expect(() => evaluate('2 + * 3')).not.toThrow(OverflowError);
});

test('AC9 (additional malformed shapes): unbalanced parens, trailing tokens, and empty input are all malformed', () => {
  expect(() => evaluate('(2 + 3')).toThrow(MalformedExpressionError);
  expect(() => evaluate('2 3')).toThrow(MalformedExpressionError);
  expect(() => evaluate('')).toThrow(MalformedExpressionError);
  expect(() => evaluate('pie')).toThrow(MalformedExpressionError);
});

test('Sci-AC1: sin/cos/tan default to radians when no angle mode is set', () => {
  expect(evaluate('sin(pi / 2)')).toBeCloseTo(1, 10);
  expect(evaluate('cos(pi)')).toBeCloseTo(-1, 10);
});

test('Sci-AC2: sin/cos/tan use degrees when angle mode is explicitly degrees', () => {
  expect(evaluate('sin(90)', { angleMode: 'degrees' })).toBeCloseTo(1, 10);
  expect(evaluate('cos(180)', { angleMode: 'degrees' })).toBeCloseTo(-1, 10);
});

test('Sci-AC3: arcsin/arccos/arctan return the angle in the currently selected mode', () => {
  expect(evaluate('arcsin(1)')).toBeCloseTo(Math.PI / 2, 10);
  expect(evaluate('arcsin(1)', { angleMode: 'degrees' })).toBeCloseTo(90, 10);
  expect(evaluate('arccos(0)', { angleMode: 'degrees' })).toBeCloseTo(90, 10);
  expect(evaluate('arctan(1)', { angleMode: 'degrees' })).toBeCloseTo(45, 10);
});

test('Sci-AC4: arcsin/arccos outside [-1, 1] throw a distinct TrigDomainError', () => {
  expect(() => evaluate('arcsin(2)')).toThrow(TrigDomainError);
  expect(() => evaluate('arccos(2)')).toThrow(TrigDomainError);
  expect(() => evaluate('arcsin(2)')).not.toThrow(LogarithmDomainError);
  expect(() => evaluate('arcsin(2)')).not.toThrow(MalformedExpressionError);
});

test('Sci-AC5: ln and log base-10 return the correct value for a positive input', () => {
  expect(evaluate('ln(e)')).toBeCloseTo(1, 10);
  expect(evaluate('log(100)')).toBeCloseTo(2, 10);
});

test('Sci-AC6: ln/log of zero or a negative number throw a distinct LogarithmDomainError', () => {
  expect(() => evaluate('ln(0)')).toThrow(LogarithmDomainError);
  expect(() => evaluate('log(0 - 5)')).toThrow(LogarithmDomainError);
  expect(() => evaluate('ln(0)')).not.toThrow(RootDomainError);
});

test('Sci-AC7: exp returns the correct value for any real exponent', () => {
  expect(evaluate('exp(0)')).toBe(1);
  expect(evaluate('exp(2)')).toBeCloseTo(Math.E ** 2, 10);
});

test('Sci-AC8: sqrt returns the correct value for a non-negative input', () => {
  expect(evaluate('sqrt(16)')).toBe(4);
  expect(evaluate('sqrt(0)')).toBe(0);
});

test('Sci-AC9: sqrt of a negative number throws a distinct RootDomainError', () => {
  expect(() => evaluate('sqrt(0 - 4)')).toThrow(RootDomainError);
  expect(() => evaluate('sqrt(0 - 4)')).not.toThrow(LogarithmDomainError);
  expect(() => evaluate('sqrt(0 - 4)')).not.toThrow(FactorialDomainError);
});

test('Sci-AC10: cbrt and the generic nth root return the correct value for a positive input', () => {
  expect(evaluate('cbrt(8)')).toBeCloseTo(2, 10);
  expect(evaluate('root(32, 5)')).toBeCloseTo(2, 10);
});

test('Sci-AC11: an even-indexed root of a negative number throws a distinct RootDomainError', () => {
  expect(() => evaluate('root(0 - 16, 4)')).toThrow(RootDomainError);
  expect(() => evaluate('root(0 - 16, 4)')).not.toThrow(TrigDomainError);
});

test('Sci-AC12: factorial returns the correct value for a non-negative integer', () => {
  expect(evaluate('5!')).toBe(120);
  expect(evaluate('0!')).toBe(1);
});

test('Sci-AC13: factorial of a negative integer throws a distinct FactorialDomainError', () => {
  expect(() => evaluate('(0 - 3)!')).toThrow(FactorialDomainError);
  expect(() => evaluate('(0 - 3)!')).not.toThrow(RootDomainError);
  expect(() => evaluate('(0 - 3)!')).not.toThrow(MalformedExpressionError);
});

test('Sci-AC14: a scientific function combined with arithmetic respects order of operations', () => {
  expect(evaluate('2 + sqrt(16) * 3')).toBe(14);
  expect(evaluate('2 * 3! + 1')).toBe(13);
});
