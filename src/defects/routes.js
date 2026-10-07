const express = require('express');
const { DefectValidationError, createDefect, getDefect, listDefects } = require('./store');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listDefects());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(createDefect(req.body));
  } catch (err) {
    if (err instanceof DefectValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const defect = getDefect(req.params.id);
    if (!defect) {
      return res.status(404).json({ error: 'defect not found' });
    }
    res.status(200).json(defect);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
