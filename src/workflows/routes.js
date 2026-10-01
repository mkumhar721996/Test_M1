const express = require('express');
const { createWorkflow, updateWorkflow } = require('./store');
const { startRun } = require('../runs/store');
const { getHire } = require('../hires/store');
const { enforceOnboardingRole } = require('../runs/auth');

const router = express.Router();

router.post('/', (req, res) => {
  const definition = createWorkflow(req.body.taskGraph);
  res.status(201).json({ id: definition.workflowId, version: definition.version, taskGraph: definition.taskGraph });
});

router.post('/:id/versions', (req, res) => {
  const definition = updateWorkflow(req.params.id, req.body.taskGraph);
  if (!definition) return res.status(404).json({ error: 'workflow not found' });
  res.status(201).json({ id: definition.workflowId, version: definition.version, taskGraph: definition.taskGraph });
});

router.post('/:id/runs', enforceOnboardingRole, (req, res) => {
  const { hireId } = req.body;
  if (hireId !== undefined && hireId !== null) {
    if (typeof hireId !== 'string') return res.status(400).json({ error: 'hireId must be a string' });
    if (!getHire(hireId)) return res.status(404).json({ error: 'hire not found' });
  }
  const run = startRun(req.params.id, hireId);
  if (!run) return res.status(404).json({ error: 'workflow not found' });
  res.status(201).json(run);
});

module.exports = router;
