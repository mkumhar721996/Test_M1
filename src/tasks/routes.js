const express = require('express');
const { TaskValidationError, createTask } = require('./store');

const router = express.Router();

router.post('/', (req, res, next) => {
  try {
    const task = createTask(req.body);
    res.status(201).json(task);
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return res.status(422).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

module.exports = router;
