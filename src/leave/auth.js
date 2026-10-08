const STAFF_ROLES = ['hr', 'manager'];

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

function identifyTimeOffSelf(req, res, next) {
  const employeeId = req.headers['x-employee-id'];
  if (!employeeId) return res.status(401).json({ error: 'unauthorized' });
  req.employeeId = employeeId;
  return next();
}

function identifyTimeOffViewer(req, res, next) {
  if (STAFF_ROLES.includes(req.headers['x-staff-role'])) {
    req.viewScope = 'all';
    return next();
  }
  const employeeId = req.headers['x-employee-id'];
  if (!employeeId) return res.status(401).json({ error: 'unauthorized' });
  req.viewScope = 'self';
  req.employeeId = employeeId;
  return next();
}

function identifyBalanceViewer(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (STAFF_ROLES.includes(role)) return next();
  const employeeId = req.headers['x-employee-id'];
  if (employeeId) {
    if (employeeId === req.params.employeeId) return next();
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  return res.status(403).json({ error: 'forbidden' });
}

module.exports = {
  requireHrRole, identifyTimeOffSelf, identifyTimeOffViewer, identifyBalanceViewer,
};
