const crypto = require('crypto');

if (!process.env.WORKFLOWS_AUTH_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    'WORKFLOWS_AUTH_SECRET is not set; generating a random per-process secret. ' +
      'Set WORKFLOWS_AUTH_SECRET in production so tokens remain valid across restarts.'
  );
}
const runtimeSecret = process.env.WORKFLOWS_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

function sign(claims, secret = runtimeSecret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: nowSeconds, exp: nowSeconds + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token, secret = runtimeSecret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const { iat, exp, ...claims } = payload;
  if (typeof iat !== 'number' || typeof exp !== 'number') return null;
  if (Math.floor(Date.now() / 1000) >= exp) return null;

  return claims;
}

module.exports = { sign, verify };
