const express = require('express');
const { getRun } = require('./store');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/:id', (req, res) => {
  const run = getRun(req.tenantId, req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(run);
});

module.exports = router;
