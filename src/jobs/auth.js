// Identity is a client-asserted `x-user-id` header, which is NOT verified. It is accepted only
// outside production so it can never be the production authn/authz boundary; in production every
// request is rejected (fail closed) until a verified credential (session/token) replaces this.
function requireAuthenticatedUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (process.env.NODE_ENV === 'production' || !userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.userId = userId;
  next();
}

module.exports = { requireAuthenticatedUser };
