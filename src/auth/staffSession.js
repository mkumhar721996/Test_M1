const crypto = require('crypto');

// Dev-only fallback so the app runs out of the box; production deployments
// must set STAFF_SESSION_SECRET so tokens can't be forged offline.
const SECRET = process.env.STAFF_SESSION_SECRET || 'dev-only-insecure-staff-session-secret';

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}

function signStaffToken({ staffId, role }) {
  const body = Buffer.from(JSON.stringify({ staffId, role })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifyStaffToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [body, signature] = token.split('.');
  const expected = sign(body);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.role !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { signStaffToken, verifyStaffToken };
