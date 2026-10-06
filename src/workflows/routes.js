const express = require('express');
const { createWorkflow, updateWorkflow, listWorkflows } = require('./store');
const { startRun, buildSteps } = require('../runs/store');
const { getHire } = require('../hires/store');
const { enforceOnboardingRole } = require('../runs/auth');

const router = express.Router();

router.post('/', (req, res) => {
  const definition = createWorkflow(req.body.taskGraph, req.body.name);
  res.status(201).json({ id: definition.workflowId, name: definition.name, version: definition.version, taskGraph: definition.taskGraph });
});

router.get('/', enforceOnboardingRole, (req, res) => {
  const summaries = listWorkflows().map((wf) => ({
    id: wf.workflowId,
    name: wf.name || wf.workflowId,
    version: wf.version,
    steps: buildSteps(wf.taskGraph).map((s) => ({ name: s.name, owner: s.owner, requirementLabel: s.requirementLabel })),
  }));
  res.status(200).json(summaries);
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
