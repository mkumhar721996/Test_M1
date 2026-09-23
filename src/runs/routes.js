const express = require('express');
const store = require('./store');

const router = express.Router();

router.post('/', (req, res) => {
  res.status(201).json(store.createRun(req.body));
});

router.get('/:id', (req, res) => {
  const run = store.getRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'run not found' });
  }
  res.status(200).json(run);
});

router.post('/:runId/tasks/:taskId/failures', (req, res) => {
  try {
    const detail = store.recordTaskFailure(req.params.runId, req.params.taskId, req.body.reason);
    res.status(200).json(detail);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:runId/tasks/:taskId/resolution', (req, res) => {
  try {
    const detail = store.resolveTask(req.params.runId, req.params.taskId, req.body);
    res.status(200).json(detail);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
