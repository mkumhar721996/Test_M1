const express = require('express');
const {
  RepairRequestValidationError, RepairRequestLockedError, createRequest, listRequests,
  findOwned, listMine, cancelRequest, updateRequestDetails,
} = require('./store');
const { requireDispatcherRole, requireAuthenticatedUser } = require('./auth');

const router = express.Router();

const NOT_FOUND = { error: 'repair_request_not_found' };
const LOCKED = {
  error: 'repair_request_locked',
  message: 'A technician has already been assigned, so changes now go through support.',
};

function handleError(err, res, next) {
  if (err instanceof RepairRequestValidationError) {
    return res.status(400).json({ error: 'validation_error', fields: err.fields });
  }
  if (err instanceof RepairRequestLockedError) return res.status(409).json(LOCKED);
  return next(err);
}

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(createRequest({ ...req.body, customerId: req.headers['x-user-id'] || '' }));
  } catch (err) {
    handleError(err, res, next);
  }
});

router.get('/', requireDispatcherRole, (req, res, next) => {
  try {
    res.status(200).json(listRequests());
  } catch (err) {
    next(err);
  }
});

// Registered before '/:id' so "mine" isn't treated as an id.
router.get('/mine', requireAuthenticatedUser, (req, res) => {
  res.status(200).json(listMine(req.userId));
});

router.get('/:id', requireAuthenticatedUser, (req, res) => {
  const record = findOwned(req.params.id, req.userId);
  if (!record) return res.status(404).json(NOT_FOUND);
  return res.status(200).json(record);
});

router.patch('/:id', requireAuthenticatedUser, (req, res, next) => {
  try {
    const record = updateRequestDetails(req.params.id, req.userId, req.body);
    if (!record) return res.status(404).json(NOT_FOUND);
    return res.status(200).json(record);
  } catch (err) {
    return handleError(err, res, next);
  }
});

router.post('/:id/cancel', requireAuthenticatedUser, (req, res, next) => {
  try {
    const record = cancelRequest(req.params.id, req.userId);
    if (!record) return res.status(404).json(NOT_FOUND);
    return res.status(200).json(record);
  } catch (err) {
    return handleError(err, res, next);
  }
});

module.exports = router;
