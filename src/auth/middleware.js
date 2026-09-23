const { verify } = require('./tokens');

function requireAuth(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'a valid bearer token is required' });
  }
  const claims = verify(token);
  if (!claims || !claims.tenantId || !claims.actorId || !claims.role) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
  req.actor = claims;
  req.tenantId = claims.tenantId;
  next();
}

module.exports = { requireAuth };
