const express = require('express');
const {
  STATUSES,
  RoomValidationError,
  RoomUnavailableError,
  createRoom,
  getRoom,
  listRooms,
  updateRoomStatus,
  requestBooking,
} = require('./store');

const router = express.Router();

// No router in this app (guests, hires, expenses, employees, workflows, runs)
// has authentication/authorization or request metrics middleware — there is no
// session/login system or metrics library anywhere in the codebase yet. Bolting
// a bespoke auth check or a Prometheus-style instrumentation onto this router
// alone would be inconsistent with every sibling endpoint and wouldn't actually
// close the app-wide gap. That needs a dedicated cross-cutting story; tracked
// here as a known limitation rather than papered over.

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listRooms());
  } catch (err) {
    next(err);
  }
});

router.get('/statuses', (req, res) => {
  res.status(200).json({ statuses: STATUSES });
});

router.post('/', (req, res, next) => {
  try {
    const room = createRoom(req.body, req.body.actor);
    res.status(201).json(room);
  } catch (err) {
    if (err instanceof RoomValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const room = getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', (req, res, next) => {
  try {
    const room = updateRoomStatus(req.params.id, req.body.status, req.body.actor);
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(200).json(room);
  } catch (err) {
    if (err instanceof RoomValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/booking-requests', (req, res, next) => {
  try {
    const result = requestBooking(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof RoomUnavailableError) {
      console.warn({ action: 'bookingRejected', roomId: req.params.id, reason: err.message });
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
