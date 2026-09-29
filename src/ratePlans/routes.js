const express = require('express');
const ratePlansStore = require('./store');
const { RatePlanValidationError, getRatePlan, updateRatePlan, deleteRatePlan } = ratePlansStore;

const router = express.Router();

// See the TEMPORARY/NOT REAL SECURITY note in ./store.js: this is an interim, client-header
// gate — not authentication — kept only because no access control is worse than this, per
// explicit security review guidance, until real session-based auth exists for the app.
function isPermitted(req) {
  return ratePlansStore.canManageRatePlans(req.headers['x-staff-role']);
}

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(ratePlansStore.listRatePlans());
  } catch (err) {
    next(err);
  }
});

router.get('/room-types', (req, res, next) => {
  try {
    res.status(200).json(ratePlansStore.listRoomTypes());
  } catch (err) {
    next(err);
  }
});

router.get('/price-lookup', (req, res, next) => {
  try {
    const { roomType, date } = req.query;
    if (!roomType || !date) {
      return res.status(400).json({ error: 'roomType and date are required' });
    }
    if (!ratePlansStore.roomTypeCodes().includes(roomType)) {
      return res.status(400).json({ error: 'invalid roomType' });
    }
    res.status(200).json(ratePlansStore.resolvePrice(roomType, date));
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const plan = ratePlansStore.createRatePlan(req.body);
    res.status(201).json(plan);
  } catch (err) {
    if (err instanceof RatePlanValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
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
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const plan = updateRatePlan(req.params.id, req.body);
    if (!plan) {
      return res.status(404).json({ error: 'rate plan not found' });
    }
    res.status(200).json(plan);
  } catch (err) {
    if (err instanceof RatePlanValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
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
