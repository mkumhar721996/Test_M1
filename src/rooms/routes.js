const express = require('express');
const roomsStore = require('./store');
const { RoomValidationError, RoomUnavailableError, getRoom, updateRoomStatus, requestBooking } = roomsStore;

const router = express.Router();

router.get('/room-types', (req, res) => {
  res.status(200).json(roomsStore.listRoomTypes());
});

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(roomsStore.listRooms());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const room = roomsStore.createRoom(req.body, req.body.actor);
    res.status(201).json(room);
  } catch (err) {
    if (err instanceof RoomValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
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
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.post('/:id/booking-requests', (req, res, next) => {
  try {
    const room = getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    const result = requestBooking(req.params.id);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof RoomUnavailableError) {
      return res.status(409).json({ error: 'room_unavailable', reason: err.reason });
    }
    next(err);
  }
});

module.exports = router;
