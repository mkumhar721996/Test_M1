const express = require('express');
const { getRun, listRuns, completeRun, advanceStep, resolveStepRequirement } = require('./store');
const { getHire } = require('../hires/store');
const { evaluateRun, getReminderStatus } = require('../reminders/store');
const { enforceOnboardingRole } = require('./auth');

const router = express.Router();

function withHire(run) {
  const hire = run.hireId ? getHire(run.hireId) : null;
  const summary = hire
    ? { id: hire.id, name: hire.name, role: hire.role, department: hire.department, onboardingStatus: hire.onboardingStatus }
    : null;
  return { ...run, hire: summary, reminders: getReminderStatus(run) };
}

router.get('/', (req, res) => {
  const summaries = listRuns()
    .filter((run) => run.hireId)
    .map((run) => {
      const hire = getHire(run.hireId);
      const step = run.steps[run.currentIndex];
      return {
        id: run.id,
        hireId: run.hireId,
        hireName: hire ? hire.name : '',
        role: hire ? hire.role : '',
        department: hire ? hire.department : '',
        status: run.status,
        currentStepLabel: `Step ${run.currentIndex + 1} of ${run.steps.length} — ${step ? step.name : ''}`,
        startedAt: run.startedAt,
      };
    });
  res.status(200).json(summaries);
});

router.get('/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(withHire(run));
});

router.get('/:id/reminders', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(getReminderStatus(run));
});

router.post('/:id/reminders/check', enforceOnboardingRole, (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  evaluateRun(run, new Date());
  res.status(200).json(getReminderStatus(run));
});

router.post('/:id/complete', (req, res) => {
  const run = completeRun(req.params.id, req.body);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(run);
});

router.post('/:id/advance', enforceOnboardingRole, (req, res) => {
  const run = advanceStep(req.params.id, req.actor);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(withHire(run));
});

router.post('/:id/resolve-requirement', enforceOnboardingRole, (req, res) => {
  const run = resolveStepRequirement(req.params.id, req.actor);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(withHire(run));
});

module.exports = router;
