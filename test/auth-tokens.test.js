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

test('garbage input is not verified', () => {
  expect(verify('not-a-real-token')).toBeNull();
  expect(verify(undefined)).toBeNull();
});
