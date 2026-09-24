const { passwordMeetsComplexity, _resetForTests } = require('../src/auth/store');

beforeEach(() => {
  _resetForTests();
});

test('AC6: passwordMeetsComplexity rejects a password missing a required class', () => {
  expect(passwordMeetsComplexity('alllowercase1!')).toBe(false);
  expect(passwordMeetsComplexity('GoodPassw0rd!')).toBe(true);
});
