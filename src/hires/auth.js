const DEFAULT_TENANT = 'Acme Corp';
const ROLE_LABELS = { hr: 'HR Admin', manager: 'Manager', new_hire: 'New hire' };

function resolveHireActor(req, res, next) {
  const role = req.headers['x-staff-role'];
  if (!role) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!Object.prototype.hasOwnProperty.call(ROLE_LABELS, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.hireActor = {
    role,
    name: req.headers['x-staff-name'] || null,
    hireId: req.headers['x-hire-id'] || null,
    tenant: req.headers['x-tenant'] || DEFAULT_TENANT,
  };
  next();
}

function canViewHire(actor, hire) {
  if (!hire) return { allowed: false, reason: 'not_found' };
  if (hire.tenant !== actor.tenant) return { allowed: false, reason: 'cross_tenant' };
  if (actor.role === 'hr') return { allowed: true };
  if (actor.role === 'manager') {
    return actor.name && hire.hiringManager === actor.name
      ? { allowed: true }
      : { allowed: false, reason: 'not_direct_report' };
  }
  if (actor.role === 'new_hire') {
    return actor.hireId && hire.id === actor.hireId
      ? { allowed: true }
      : { allowed: false, reason: 'not_own_profile' };
  }
  return { allowed: false, reason: 'unknown' };
}

function visibleHiresForActor(actor, hires) {
  return hires.filter((h) => h.tenant === actor.tenant
    && (actor.role === 'hr' || (actor.role === 'manager' && Boolean(actor.name) && h.hiringManager === actor.name)));
}

module.exports = { DEFAULT_TENANT, ROLE_LABELS, resolveHireActor, canViewHire, visibleHiresForActor };
