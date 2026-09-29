const express = require('express');
const reservationsStore = require('./store');
const {
  ReservationValidationError,
  ReservationConflictError,
  ReservationImmutableFieldError,
  getReservation,
  updateReservation,
} = reservationsStore;

const router = express.Router();

router.post('/', (req, res, next) => {
  if (!reservationsStore.canCreateReservation(req.headers['x-staff-role'])) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const reservation = reservationsStore.createReservation(req.body, req.body.actor);
    res.status(201).json(reservation);
  } catch (err) {
    if (err instanceof ReservationValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    if (err instanceof ReservationConflictError) {
      return res.status(409).json({ error: 'conflict' });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const reservation = getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'reservation not found' });
    }
    res.status(200).json(reservation);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const reservation = updateReservation(req.params.id, req.body);
    if (!reservation) {
      return res.status(404).json({ error: 'reservation not found' });
    }
    res.status(200).json(reservation);
  } catch (err) {
    if (err instanceof ReservationImmutableFieldError) {
      return res.status(400).json({ error: 'immutable_field', fields: err.fields });
    }
    next(err);
  }
});

module.exports = router;
