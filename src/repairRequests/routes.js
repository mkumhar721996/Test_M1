const express = require('express');
const { RepairRequestValidationError, createRequest, listRequests } = require('./store');

const router = express.Router();

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(createRequest(req.body));
  } catch (err) {
    if (err instanceof RepairRequestValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listRequests());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
