const express = require('express');
const { updateTask } = require('./store');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'status'];

class TaskValidationError extends Error {}

function assertValidBody(body) {
  if (body === null || Array.isArray(body) || typeof body !== 'object') {
    throw new TaskValidationError('Request body must be a JSON object.');
  }
}

function pickFields(body, fields) {
  return fields.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

router.put('/:id', (req, res, next) => {
  try {
    assertValidBody(req.body);
    const task = updateTask(req.params.id, pickFields(req.body, PATCHABLE_FIELDS));
    if (!task) {
      return res.status(404).json({ error: 'task not found' });
    }
    res.status(200).json(task);
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    next(err);
  }
});

module.exports = router;
