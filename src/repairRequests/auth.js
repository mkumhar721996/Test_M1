// Unlike guests/rooms/leave/runs (which only gate *actions*, not bulk PII reads), GET / here
// returns every customer's address, description and photos — a self-asserted `x-staff-role`
// header is not a meaningful boundary for that, because whatever value the shipped client would
// send is public (readable in the bundle / devtools). So this gate fails closed in production
// (reject regardless of header) until a server-verified credential (session/token, checked
// server-side) replaces it; outside production the header still lets a developer/reviewer probe
// the route directly, matching src/defects/auth.js's identity gate. The client in
// public/js/services.js deliberately does NOT send this header — see its listQueue() comment.
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

// Client-asserted dev identity (same convention as src/jobs/auth.js and src/defects/auth.js):
// fails closed in production until a server-verified credential exists.
function requireAuthenticatedUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (process.env.NODE_ENV === 'production' || !userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.userId = userId;
  return next();
}

module.exports = { requireDispatcherRole, requireAuthenticatedUser };
