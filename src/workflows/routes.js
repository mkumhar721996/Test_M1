const express = require('express');
const { createWorkflow, updateWorkflow } = require('./store');
const { startRun } = require('../runs/store');

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

router.post('/:id/runs', (req, res) => {
  const run = startRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'workflow not found' });
  res.status(201).json(run);
});

module.exports = router;
