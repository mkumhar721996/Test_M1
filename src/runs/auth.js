const crypto = require('crypto');

const ROLE_ACTORS = { manager: 'Manager', hr: 'HR' };

function enforceOnboardingRole(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (!role) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!Object.prototype.hasOwnProperty.call(ROLE_ACTORS, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.actor = ROLE_ACTORS[role];
  next();
}

function enforceServiceCredential(req, res, next) {
  const expected = process.env.CHECK_SIGNAL_SECRET;
  const provided = req.headers['x-service-key'];
  if (!provided) return res.status(401).json({ error: 'unauthorized' });
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected || '');
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

module.exports = { enforceOnboardingRole, enforceServiceCredential };
