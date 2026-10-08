const express = require('express');
const { HireValidationError, createHire, getHire, listHires, updateHire, deactivateHire, reactivateHire } = require('./store');

const { enforceOnboardingRole } = require('../runs/auth');
const { ROLE_LABELS, resolveHireActor, canViewHire, visibleHiresForActor } = require('./auth');
const { recordAuditEntry, listAuditLogForTenant } = require('./auditLog');
const { pickFields } = require('../lib/pickFields');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage', 'hiringManager'];

const DENIAL_DETAIL = {
  cross_tenant: 'Profile belongs to a different tenant.',
  not_direct_report: 'Not one of the actor\'s direct reports.',
  not_own_profile: 'Not the actor\'s own profile.',
};

function audit(actor, action, hire, result, detail) {
  recordAuditEntry({
    tenant: actor.tenant,
    actorName: actor.name || ROLE_LABELS[actor.role],
    actorRole: ROLE_LABELS[actor.role],
    action,
    targetId: hire.id,
    targetName: hire.name,
    result,
    detail,
  });
}

const mutationGuards = [enforceOnboardingRole, resolveHireActor];

// Shared by edit/deactivate/reactivate: 404, tenant check (audited), then the store call (audited).
function mutationRoute(verb, deniedAction, doneAction, run) {
  return async (req, res, next) => {
    try {
      const existing = getHire(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'hire not found' });
      }
      const actor = req.hireActor;
      if (existing.tenant !== actor.tenant) {
        audit(actor, deniedAction, existing, 'denied', DENIAL_DETAIL.cross_tenant);
        return res.status(403).json({ error: 'forbidden', reason: 'cross_tenant' });
      }
      const hire = await run(req);
      audit(actor, doneAction, hire, 'allowed', verb);
      res.status(200).json(hire);
    } catch (err) {
      if (err instanceof HireValidationError) {
        return res.status(400).json({ error: 'validation_error', fields: err.fields });
      }
      next(err);
    }
  };
}

router.get('/', resolveHireActor, (req, res, next) => {
  try {
    res.status(200).json(visibleHiresForActor(req.hireActor, listHires()));
  } catch (err) {
    next(err);
  }
});

router.post('/', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await createHire(req.body);
    res.status(201).json(hire);
  } catch (err) {
    if (err instanceof HireValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

// Must be registered before '/:id', otherwise 'audit-log' is captured as an id.
router.get('/audit-log', resolveHireActor, (req, res) => {
  if (req.hireActor.role !== 'hr') {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.status(200).json(listAuditLogForTenant(req.hireActor.tenant));
});

router.get('/:id', resolveHireActor, (req, res, next) => {
  try {
    const hire = getHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    const access = canViewHire(req.hireActor, hire);
    audit(
      req.hireActor,
      access.allowed ? 'Viewed profile' : 'Attempted to view profile',
      hire,
      access.allowed ? 'allowed' : 'denied',
      access.allowed ? '—' : (DENIAL_DETAIL[access.reason] || 'Access denied.'),
    );
    if (!access.allowed) {
      return res.status(403).json({ error: 'forbidden', reason: access.reason });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...mutationGuards, mutationRoute('Profile updated.', 'Attempted to edit profile', 'Edited profile',
  (req) => updateHire(req.params.id, pickFields(req.body, PATCHABLE_FIELDS))));

router.post('/:id/deactivate', ...mutationGuards, mutationRoute('Profile deactivated.', 'Attempted to deactivate profile', 'Deactivated profile',
  (req) => deactivateHire(req.params.id)));

router.post('/:id/reactivate', ...mutationGuards, mutationRoute('Profile reactivated.', 'Attempted to reactivate profile', 'Reactivated profile',
  (req) => reactivateHire(req.params.id)));

module.exports = router;
