const express = require('express');
const { getRun, completeRun } = require('./store');

const router = express.Router();

router.get('/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(run);
});

router.post('/:id/complete', (req, res) => {
  const run = completeRun(req.params.id, req.body);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(run);
});

module.exports = router;
