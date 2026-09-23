process.env.ACTOR_TOKEN_SECRET = 'test-actor-token-secret';

const { signActorToken, verifyActorToken } = require('../src/auth/actor');

test('verifyActorToken accepts a token signed with the configured secret', () => {
  const token = signActorToken('tenant-1', 'hr_coordinator');
  expect(verifyActorToken(token)).toEqual({ tenantId: 'tenant-1', role: 'hr_coordinator' });
});

test('verifyActorToken rejects a token whose signature does not match its payload', () => {
  const token = signActorToken('tenant-1', 'hr_coordinator');
  const [payload] = token.split('.');
  const tampered = `${payload}.0000000000000000000000000000000000000000000000000000000000000000`;
  expect(verifyActorToken(tampered)).toBeNull();
});

test('verifyActorToken rejects a token whose payload was changed after signing', () => {
  const token = signActorToken('tenant-1', 'hr_coordinator');
  const [, signature] = token.split('.');
  const forgedPayload = Buffer.from('tenant-1:platform_admin').toString('base64');
  expect(verifyActorToken(`${forgedPayload}.${signature}`)).toBeNull();
});

test('verifyActorToken rejects missing or malformed tokens', () => {
  expect(verifyActorToken(undefined)).toBeNull();
  expect(verifyActorToken('not-a-valid-token')).toBeNull();
});

test('verifyActorToken preserves a tenantId containing a colon rather than splitting it', () => {
  const token = signActorToken('company:dept', 'hr_coordinator');
  expect(verifyActorToken(token)).toEqual({ tenantId: 'company:dept', role: 'hr_coordinator' });
});
