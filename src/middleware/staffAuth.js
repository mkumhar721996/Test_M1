const STAFF_USERNAME = process.env.STAFF_USERNAME || 'frontdesk';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'frontdesk-staff';

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
