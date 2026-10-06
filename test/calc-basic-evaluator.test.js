const {
  evaluate,
  DivisionByZeroError,
  InvalidExpressionError,
} = require('../src/calc/basicEvaluator');

test('AC1: precedence independent of term order', () => {
  expect(evaluate('2 + 3 * 4')).toBe(14);
  expect(evaluate('3 * 4 + 2')).toBe(14);
});
test('AC2: division binds tighter than subtraction', () => {
  expect(evaluate('10 - 4 / 2')).toBe(8);
});
test('AC3: * and / are left-associative', () => {
  expect(evaluate('20 / 4 * 2')).toBe(10);
});
test('AC4: + and - are left-associative', () => {
  expect(evaluate('8 - 3 + 2')).toBe(7);
});
test('AC5: mixed chain', () => {
  expect(evaluate('6 + 2 * 5 - 3 / 1')).toBe(13);
});
test('AC6: negative result', () => {
  expect(evaluate('3 - 5 * 2')).toBe(-7);
});
test('AC7: non-integer division', () => {
  expect(evaluate('7 / 2')).toBe(3.5);
});
test('AC8: leading unary minus', () => {
  expect(evaluate('-6 / 2')).toBe(-3);
});
test('AC9: decimal operand', () => {
  expect(evaluate('2.5 * 4')).toBe(10);
});
test('AC10: division by zero', () => {
  expect(() => evaluate('5 / 0')).toThrow(DivisionByZeroError);
});
test('AC11: missing operand', () => {
  expect(() => evaluate('3 +')).toThrow(InvalidExpressionError);
  expect(() => evaluate('3 +')).toThrow(/missing operand/i);
});
test('AC12: consecutive operators', () => {
  expect(() => evaluate('3 + * 2')).toThrow(InvalidExpressionError);
  expect(() => evaluate('3 + * 2')).toThrow(/consecutive operator/i);
});
test('AC13: overflow yields Infinity', () => {
  expect(evaluate('1e308 * 10')).toBe(Infinity);
});
