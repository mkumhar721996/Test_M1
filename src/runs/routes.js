const express = require('express');
const { getRun } = require('./store');
const { pauseRun, resumeRun, cancelRun, RunTransitionError } = require('./lifecycle');

const router = express.Router();

function handleTransition(action) {
  return (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    const actor = { id: req.body.actorId, role: req.body.actorRole };
    try {
      res.status(200).json(action(run, actor));
    } catch (err) {
      if (err instanceof RunTransitionError) {
        const status = err.code === 'FORBIDDEN' ? 403 : 409;
        return res.status(status).json({ error: err.message });
      }
      throw err;
    }
  };
}

router.get('/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.status(200).json(run);
});

router.post('/:id/pause', handleTransition(pauseRun));
router.post('/:id/resume', handleTransition(resumeRun));
router.post('/:id/cancel', handleTransition(cancelRun));

module.exports = router;
