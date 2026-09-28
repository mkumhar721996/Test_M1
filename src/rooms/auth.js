const crypto = require('crypto');

// This app has no login/session system anywhere yet (guests, hires, expenses,
// employees, workflows, and runs are all equally open), so there is no
// per-user identity to authenticate a caller against. Rather than leave the
// mutating room endpoints reachable by anyone, they are gated behind a shared
// staff token: callers must present it to create rooms, change room status,
// or request a booking. The actor recorded in the audit log is derived from
// this trusted server-side identity instead of the client-supplied
// req.body.actor, which closes the audit-log spoofing vector.
const STAFF_TOKEN = process.env.ROOMS_STAFF_TOKEN || 'staff-priya-nair-token';
const STAFF_ACTOR = 'Priya Nair';

function tokensMatch(provided, expected) {
  const providedBuf = Buffer.from(String(provided || ''));
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function requireStaffAuth(req, res, next) {
  if (!tokensMatch(req.headers['x-staff-token'], STAFF_TOKEN)) {
    return res.status(401).json({ error: 'authentication required' });
  }
  req.staffActor = STAFF_ACTOR;
  next();
}

module.exports = { requireStaffAuth, STAFF_TOKEN };
