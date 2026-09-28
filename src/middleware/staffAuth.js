const crypto = require('crypto');

const STAFF_USERNAME = process.env.STAFF_USERNAME || 'frontdesk';
// Never fall back to a static, repo-committed password: generate a random one
// per process when STAFF_PASSWORD isn't set, so there is no guessable secret in source control.
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || crypto.randomBytes(24).toString('base64');

if (!process.env.STAFF_PASSWORD) {
  console.warn('[staffAuth] STAFF_PASSWORD is not set; generated a random ephemeral password for this process. Set STAFF_USERNAME and STAFF_PASSWORD via environment variables in any shared or deployed environment.');
}

function requireStaffAuth(req, res, next) {
  const [scheme, encoded] = (req.get('Authorization') || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user === STAFF_USERNAME && pass === STAFF_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Front Desk Console"');
  res.status(401).json({ error: 'authentication required' });
}

module.exports = { requireStaffAuth, STAFF_USERNAME, STAFF_PASSWORD };
