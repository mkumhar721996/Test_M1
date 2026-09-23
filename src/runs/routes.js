const express = require('express');
const { startRun } = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  const run = startRun(req.body);
  if (!run) {
    return res.status(404).json({ error: 'workflow not found' });
  }
  res.status(201).json(run);
});

module.exports = router;
