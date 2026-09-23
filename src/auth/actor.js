const crypto = require('crypto');

const ALLOWED_START_ROLES = ['hr_coordinator', 'hiring_manager', 'platform_admin'];

function getSecret() {
  return process.env.ACTOR_TOKEN_SECRET;
}

// A real upstream gateway/auth layer signs tenantId+role together with a shared
// secret before attaching them to the request. This is the seam it would call.
function signActorToken(tenantId, role) {
  const secret = getSecret();
  if (!secret) {
    throw new Error('ACTOR_TOKEN_SECRET is not configured.');
  }
  const payload = `${tenantId ?? ''}:${role ?? ''}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload, 'utf8').toString('base64')}.${signature}`;
}

// Fails closed: without a configured secret, or a token that isn't a valid
// signature over its own payload, no identity is trusted, at all.
function verifyActorToken(token) {
  const secret = getSecret();
  if (!secret || !token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const [encodedPayload, signature] = token.split('.');
  let payload;
  try {
    payload = Buffer.from(encodedPayload, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature || '', 'utf8');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  const [tenantId, role] = payload.split(':');
  return { tenantId, role };
}

function getActor(req) {
  const verified = verifyActorToken(req.header('x-actor-token'));
  return verified || { tenantId: undefined, role: undefined };
}

module.exports = { getActor, signActorToken, verifyActorToken, ALLOWED_START_ROLES };
