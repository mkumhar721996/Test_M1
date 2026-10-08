// Role is a client-asserted `x-staff-role` header (same convention as src/leave/auth.js); it is
// NOT a verified credential and must be replaced by real authn before production use.
function requireDispatcherRole(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (!role) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (role !== 'dispatcher') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

module.exports = { requireDispatcherRole };
