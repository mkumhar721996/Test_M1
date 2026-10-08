// The dispatcher role is a client-asserted `x-staff-role` header, which is NOT verified. It is
// accepted only outside production so it can never be the production authn/authz boundary; in
// production every request is rejected (fail closed) until a verified credential (session/token)
// replaces this. Mirrors src/defects/auth.js.
function requireDispatcherRole(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (process.env.NODE_ENV === 'production' || !role) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (role !== 'dispatcher') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

module.exports = { requireDispatcherRole };
