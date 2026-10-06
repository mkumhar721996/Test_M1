function requireHrRole(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (!role) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (role !== 'hr') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

module.exports = { requireHrRole };
