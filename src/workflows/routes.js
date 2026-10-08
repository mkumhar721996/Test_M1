const express = require('express');
const { createWorkflow, updateWorkflow, getLatestVersion, getVersion } = require('./store');
const { enforceWorkflowAuthorRole } = require('./auth');
const { requireAuthenticatedUser } = require('../defects/auth');
const { WorkflowValidationError } = require('./validation');
const projectsStore = require('../projects/store');
const { startRun } = require('../runs/store');
const { getHire } = require('../hires/store');
const { enforceOnboardingRole } = require('../runs/auth');

const router = express.Router();

function isVisible(definition, req) {
  return !definition.projectId || projectsStore.listProjectIdsForUser(req.userId).includes(definition.projectId);
}

function toBody(d) {
  return { id: d.workflowId, version: d.version, taskGraph: d.taskGraph, projectId: d.projectId, savedBy: d.savedBy, savedAt: d.savedAt };
}

function handleSaveError(err, res, next) {
  if (err instanceof WorkflowValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
  next(err);
}

router.post('/', enforceWorkflowAuthorRole, (req, res, next) => {
  try {
    const { taskGraph, projectId } = req.body;
    if (projectId) {
      const userId = req.headers['x-user-id'];
      if (!userId || !projectsStore.listProjectIdsForUser(userId).includes(projectId)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }
    res.status(201).json(toBody(createWorkflow(taskGraph, { projectId, actor: req.actor })));
  } catch (err) {
    handleSaveError(err, res, next);
  }
});

router.post('/:id/versions', enforceWorkflowAuthorRole, (req, res, next) => {
  try {
    const definition = updateWorkflow(req.params.id, req.body.taskGraph, { actor: req.actor });
    if (!definition) return res.status(404).json({ error: 'workflow not found' });
    res.status(201).json(toBody(definition));
  } catch (err) {
    handleSaveError(err, res, next);
  }
});

router.get('/:id', requireAuthenticatedUser, (req, res) => {
  const d = getLatestVersion(req.params.id);
  if (!d || !isVisible(d, req)) return res.status(404).json({ error: 'workflow not found' });
  res.status(200).json(toBody(d));
});

router.get('/:id/versions/:version', requireAuthenticatedUser, (req, res) => {
  const d = getVersion(req.params.id, Number(req.params.version));
  if (!d || !isVisible(d, req)) return res.status(404).json({ error: 'workflow version not found' });
  res.status(200).json(toBody(d));
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
