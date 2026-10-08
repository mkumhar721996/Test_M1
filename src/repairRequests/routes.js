const express = require('express');
const {
  RepairRequestValidationError,
  createRequest,
  listRequests,
  listRequestsForCustomer,
  getRequestForCustomer,
  updateRequestStatus,
} = require('./store');
const { requireDispatcherRole, requireAuthenticatedCustomer } = require('./auth');

const router = express.Router();

router.post('/', (req, res, next) => {
  try {
    const customerId = req.headers['x-customer-id'] || null;
    res.status(201).json(createRequest({ ...req.body, customerId }));
  } catch (err) {
    if (err instanceof RepairRequestValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.get('/', requireDispatcherRole, (req, res, next) => {
  try {
    res.status(200).json(listRequests());
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuthenticatedCustomer, (req, res) => {
  res.status(200).json(listRequestsForCustomer(req.customerId));
});

router.get('/mine/:id', requireAuthenticatedCustomer, (req, res) => {
  const record = getRequestForCustomer(req.params.id, req.customerId);
  if (!record) return res.status(404).json({ error: 'not_found' });
  return res.status(200).json(record);
});

router.patch('/:id/status', requireDispatcherRole, (req, res, next) => {
  try {
    const record = updateRequestStatus(req.params.id, req.body);
    if (!record) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(record);
  } catch (err) {
    if (err instanceof RepairRequestValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    return next(err);
  }
});

module.exports = router;
