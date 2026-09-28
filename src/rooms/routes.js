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
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
