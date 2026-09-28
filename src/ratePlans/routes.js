const express = require('express');
const {
  RatePlanValidationError,
  createRatePlan,
  getRatePlan,
  listRatePlans,
  updateRatePlan,
  deleteRatePlan,
  resolveRate,
} = require('./store');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'startDate', 'endDate', 'prices'];

function pickPatchableFields(body) {
  return PATCHABLE_FIELDS.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listRatePlans());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const plan = createRatePlan(req.body, req.body.actor);
    res.status(201).json(plan);
  } catch (err) {
    if (err instanceof RatePlanValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// Registered before '/:id' — otherwise Express would treat "price-lookup" as an :id.
router.get('/price-lookup', (req, res, next) => {
  try {
    const result = resolveRate(req.query.roomTypeId, req.query.date);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof RatePlanValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const plan = getRatePlan(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'rate plan not found' });
    }
    res.status(200).json(plan);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const plan = updateRatePlan(req.params.id, pickPatchableFields(req.body), req.body.actor);
    if (!plan) {
      return res.status(404).json({ error: 'rate plan not found' });
    }
    res.status(200).json(plan);
  } catch (err) {
    if (err instanceof RatePlanValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const deleted = deleteRatePlan(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'rate plan not found' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
