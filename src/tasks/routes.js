const express = require('express');
const { getTask, listTasks } = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  const { runId } = req.query;
  res.status(200).json(listTasks({ runId: typeof runId === 'string' ? runId : undefined }));
});

router.get('/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'task not found' });
  }
  res.status(200).json(task);
});

module.exports = router;
