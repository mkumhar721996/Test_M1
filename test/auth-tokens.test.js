const { sign, verify } = require('../src/auth/tokens');

test('a token signed with the correct secret verifies and returns its claims', () => {
  const claims = { actorId: 'user-1', role: 'hr_coordinator', tenantId: 'tenant-a' };
  const token = sign(claims);
  expect(verify(token)).toEqual(claims);
});

test('a token with a tampered payload fails verification', () => {
  const token = sign({ actorId: 'user-1', role: 'hr_coordinator', tenantId: 'tenant-a' });
  const [, signature] = token.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ actorId: 'user-1', role: 'platform_admin', tenantId: 'tenant-a' })).toString('base64url');
  expect(verify(`${forgedBody}.${signature}`)).toBeNull();
});

test('a token signed with a different secret fails verification', () => {
  const token = sign({ actorId: 'user-1', role: 'hr_coordinator', tenantId: 'tenant-a' }, 'fake-other-secret');
  expect(verify(token)).toBeNull();
});

test('a token forged with the previously-hardcoded default secret string does not verify', () => {
  const crypto = require('crypto');
  const claims = { actorId: 'attacker', role: 'platform_admin', tenantId: 'tenant-a' };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const forgedSignature = crypto
    .createHmac('sha256', 'insecure-dev-only-secret-change-me')
    .update(body)
    .digest('base64url');
  expect(verify(`${body}.${forgedSignature}`)).toBeNull();
});

test('garbage input is not verified', () => {
  expect(verify('not-a-real-token')).toBeNull();
  expect(verify(undefined)).toBeNull();
});

test('an expired token is rejected', () => {
  const claims = { actorId: 'user-1', role: 'hr_coordinator', tenantId: 'tenant-a' };
  const token = sign(claims, undefined, -1);
  expect(verify(token)).toBeNull();
});

test('a token without exp/iat claims is rejected', () => {
  const crypto = require('crypto');
  const secret = 'known-test-secret';
  const claims = { actorId: 'user-1', role: 'hr_coordinator', tenantId: 'tenant-a' };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  expect(verify(`${body}.${signature}`, secret)).toBeNull();
});
