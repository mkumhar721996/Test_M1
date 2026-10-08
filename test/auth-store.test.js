const { passwordMeetsComplexity, requestPasswordReset, _resetForTests } = require('../src/auth/store');

beforeEach(() => {
  _resetForTests();
});

test('AC6: passwordMeetsComplexity rejects a password missing a required class', () => {
  expect(passwordMeetsComplexity('alllowercase1!')).toBe(false);
  expect(passwordMeetsComplexity('GoodPassw0rd!')).toBe(true);
});

test('AC2: requestPasswordReset generates a 6-digit numeric code for the phone channel (so it can actually be typed into the OTP screen)', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetSms').mockImplementation(async (args) => { captured = args; return args; });
  await requestPasswordReset('+1 555 010 0100');
  expect(captured.credential).toMatch(/^[0-9]{6}$/);
  notifyClient.sendResetSms.mockRestore();
});

test('AC2: requestPasswordReset keeps the long opaque token for the email channel', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await requestPasswordReset('works@example.com');
  expect(captured.credential).not.toMatch(/^[0-9]{6}$/);
  expect(captured.credential.length).toBeGreaterThan(6);
  notifyClient.sendResetEmail.mockRestore();
});
