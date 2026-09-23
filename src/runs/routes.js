const express = require('express');
const { getActor, ALLOWED_START_ROLES } = require('../auth/actor');
const { startRun, getRun, DuplicateActiveRunError } = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  const actor = getActor(req);
  if (!ALLOWED_START_ROLES.includes(actor.role)) {
    return res.status(403).json({
      code: 'UNAUTHORIZED_ROLE',
      message: 'Role is not authorized to start a Run.',
    });
  }
  if (!actor.tenantId) {
    return res.status(400).json({
      code: 'MISSING_TENANT_ID',
      message: 'x-tenant-id header is required.',
    });
  }
  if (!req.body || !req.body.hireId) {
    return res.status(400).json({
      code: 'MISSING_HIRE_ID',
      message: 'hireId is required in the request body.',
    });
  }
  try {
    const run = startRun({ tenantId: actor.tenantId, hireId: req.body.hireId });
    return res.status(201).json(run);
  } catch (err) {
    if (err instanceof DuplicateActiveRunError) {
      return res.status(409).json({
        code: err.code,
        message: err.message,
        existing_run_id: err.existingRunId,
      });
    }
    throw err;
  }
});

router.get('/:id', (req, res) => {
  const actor = getActor(req);
  const run = getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  if (run.tenantId !== actor.tenantId) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Run belongs to a different tenant.' });
  }
  return res.status(200).json(run);
});

module.exports = router;
