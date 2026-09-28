const express = require('express');
const {
  GuestValidationError,
  createGuest,
  getGuest,
  listGuests,
  updateGuest,
  deactivateGuest,
  reactivateGuest,
} = require('./store');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'roomType', 'dietary', 'communication'];

function pickPatchableFields(body) {
  return PATCHABLE_FIELDS.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listGuests());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const guest = createGuest(req.body, req.body.actor);
    res.status(201).json(guest);
  } catch (err) {
    if (err instanceof GuestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const guest = getGuest(req.params.id);
    if (!guest) {
      return res.status(404).json({ error: 'guest not found' });
    }
    res.status(200).json(guest);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const guest = updateGuest(req.params.id, pickPatchableFields(req.body), req.body.actor);
    if (!guest) {
      return res.status(404).json({ error: 'guest not found' });
    }
    res.status(200).json(guest);
  } catch (err) {
    if (err instanceof GuestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/deactivate', (req, res, next) => {
  try {
    const guest = deactivateGuest(req.params.id, req.body.actor);
    if (!guest) {
      return res.status(404).json({ error: 'guest not found' });
    }
    res.status(200).json(guest);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactivate', (req, res, next) => {
  try {
    const guest = reactivateGuest(req.params.id, req.body.actor);
    if (!guest) {
      return res.status(404).json({ error: 'guest not found' });
    }
    res.status(200).json(guest);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
