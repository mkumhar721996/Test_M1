// The dispatcher role is a client-asserted `x-staff-role` header — the same trust model used by
// every other role gate in this app (guests/routes.js, rooms/routes.js, leave/auth.js,
// runs/auth.js). No NODE_ENV production lockout: this story has no verified dispatcher identity
// to fail open to (see plan.md), so a prod-only 401 would make the dispatch queue permanently
// unreachable through the shipped UI while leaving every other x-staff-role consumer reachable.
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
