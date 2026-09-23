const crypto = require('crypto');

const DEFAULT_DEV_SECRET = 'insecure-dev-only-secret-change-me';

function getSecret() {
  return process.env.WORKFLOWS_AUTH_SECRET || DEFAULT_DEV_SECRET;
}

function sign(claims, secret = getSecret()) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token, secret = getSecret()) {
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
