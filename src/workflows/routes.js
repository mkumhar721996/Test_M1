const express = require('express');
const { saveWorkflow, getLatestVersion, getVersion } = require('./store');
const { startRun } = require('../runs/store');
const { requireAuth } = require('../auth/middleware');

const AUTHORIZED_ROLES = new Set(['hr_coordinator', 'platform_admin']);
const router = express.Router();

router.use(requireAuth);

router.post('/', (req, res) => {
  if (!AUTHORIZED_ROLES.has(req.actor.role)) {
    return res.status(403).json({ error: 'not authorized to save workflow definitions' });
  }
  const { workflowId, definition } = req.body;
  if (workflowId !== undefined && (typeof workflowId !== 'string' || workflowId === '')) {
    return res.status(400).json({ error: 'workflowId must be a non-empty string' });
  }
  try {
    const record = saveWorkflow({ tenantId: req.tenantId, workflowId, definition, actor: req.actor.actorId });
    res.status(201).json(record);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    throw err;
  }
});

router.get('/:id', (req, res) => {
  const record = getLatestVersion(req.tenantId, req.params.id);
  if (!record) return res.status(404).json({ error: 'workflow not found' });
  res.status(200).json(record);
});

router.get('/:id/versions/:version', (req, res) => {
  const record = getVersion(req.tenantId, req.params.id, Number(req.params.version));
  if (!record) return res.status(404).json({ error: 'workflow version not found' });
  res.status(200).json(record);
});

router.post('/:id/runs', (req, res) => {
  const run = startRun(req.tenantId, req.params.id);
  if (!run) return res.status(404).json({ error: 'workflow not found' });
  res.status(201).json(run);
});

module.exports = router;
