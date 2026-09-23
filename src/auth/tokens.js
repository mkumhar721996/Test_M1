const crypto = require('crypto');

if (!process.env.WORKFLOWS_AUTH_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    'WORKFLOWS_AUTH_SECRET is not set; generating a random per-process secret. ' +
      'Set WORKFLOWS_AUTH_SECRET in production so tokens remain valid across restarts.'
  );
}
const runtimeSecret = process.env.WORKFLOWS_AUTH_SECRET || crypto.randomBytes(32).toString('hex');

function sign(claims, secret = runtimeSecret) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
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

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
