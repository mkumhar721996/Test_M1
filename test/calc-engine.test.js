const {
  evaluate,
  DivideByZeroError,
  OverflowError,
  MalformedExpressionError,
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
