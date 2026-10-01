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

module.exports = { enforceOnboardingRole };
