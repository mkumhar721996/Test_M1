const request = require('supertest');
const app = require('../src/server');
const { _resetForTests, verifyLogin } = require('../src/auth/store');

beforeEach(() => {
  _resetForTests();
});

test('AC1: unknown contact returns the same generic message as a known contact', async () => {
  const known = await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  const unknown = await request(app).post('/auth/forgot-password').send({ contact: 'unknown@example.com' });
  expect(known.status).toBe(200);
  expect(unknown.status).toBe(200);
  expect(unknown.body.message).toBe(known.body.message);
});

test('AC2: a verified email contact triggers a reset email send', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  const spy = jest.spyOn(notifyClient, 'sendResetEmail').mockResolvedValue({});
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: 'works@example.com', ttlMinutes: 15 }));
  spy.mockRestore();
});

test('AC2: a verified phone contact triggers a reset SMS send', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  const spy = jest.spyOn(notifyClient, 'sendResetSms').mockResolvedValue({});
  await request(app).post('/auth/forgot-password').send({ contact: '+1 555 010 0100' });
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: '+1 555 010 0100', ttlMinutes: 10 }));
  spy.mockRestore();
});

test('AC3: a valid unused unexpired credential verifies', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
  expect(res.status).toBe(200);
  expect(res.body.valid).toBe(true);
  notifyClient.sendResetEmail.mockRestore();
});

test('AC4: an unknown credential is invalid', async () => {
  const res = await request(app).post('/auth/reset/verify').send({ credential: 'does-not-exist' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('invalid_or_expired');
});

test('AC4: a credential is invalid once its expiry window has passed', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  const realNow = Date.now();
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 16 * 60 * 1000);
  const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
  expect(res.status).toBe(400);
  nowSpy.mockRestore();
  notifyClient.sendResetEmail.mockRestore();
});

test('AC4: a credential is invalid once already used', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'Another1!', confirmPassword: 'Another1!' });
  const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
  expect(res.status).toBe(400);
  notifyClient.sendResetEmail.mockRestore();
});

test('AC7: resetPassword rejects a mismatched confirmation', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  const res = await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'GoodPassw0rd!', confirmPassword: 'Different1!' });
  expect(res.status).toBe(422);
  expect(res.body.error).toBe('password_mismatch');
  notifyClient.sendResetEmail.mockRestore();
});

test('AC8: the new password works for subsequent login; the old one no longer does', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'BrandNew1!', confirmPassword: 'BrandNew1!' });
  expect(verifyLogin('works@example.com', 'BrandNew1!')).toBe(true);
  expect(verifyLogin('works@example.com', 'OldPassw0rd!')).toBe(false);
  notifyClient.sendResetEmail.mockRestore();
});

test('AC9: a valid matching submission returns success', async () => {
  const notifyClient = require('../src/auth/notifyClient');
  let captured;
  jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
  await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
  const res = await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'BrandNew1!', confirmPassword: 'BrandNew1!' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  notifyClient.sendResetEmail.mockRestore();
});
