const express = require('express');
const roomsStore = require('./store');
const { RoomValidationError, RoomMaintenanceBlockedError, getRoom, updateRoom, deactivateRoom, reactivateRoom } = roomsStore;

const router = express.Router();

const CREATABLE_FIELDS = ['number', 'type', 'status'];
const PATCHABLE_FIELDS = ['number', 'type', 'status'];

const DENIED_MESSAGE = {
  view: "You don't have permission to view the room inventory",
  create: "You don't have permission to create rooms",
  update: "You don't have permission to update rooms",
  deactivate: "You don't have permission to deactivate rooms",
};

function isPermitted(req) {
  return roomsStore.canManageRooms(req.headers['x-staff-role']);
}

function pickFields(body, fields) {
  return fields.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

function denyUnless(action) {
  return (req, res, next) => {
    if (!isPermitted(req)) {
      return res.status(403).json({ error: 'forbidden', message: DENIED_MESSAGE[action] });
    }
    next();
  };
}

router.get('/', denyUnless('view'), (req, res, next) => {
  try {
    res.status(200).json(roomsStore.listRooms());
  } catch (err) {
    next(err);
  }
});

router.post('/', denyUnless('create'), (req, res, next) => {
  try {
    const room = roomsStore.createRoom(pickFields(req.body, CREATABLE_FIELDS));
    res.status(201).json(room);
  } catch (err) {
    if (err instanceof RoomValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.patch('/:id', denyUnless('update'), (req, res, next) => {
  try {
    const room = updateRoom(req.params.id, pickFields(req.body, PATCHABLE_FIELDS));
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(200).json(room);
  } catch (err) {
    if (err instanceof RoomValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    if (err instanceof RoomMaintenanceBlockedError) {
      return res.status(409).json({
        error: 'maintenance_blocked',
        message: err.message,
        conflictingReservations: err.conflictingReservations,
      });
    }
    next(err);
  }
});

router.post('/:id/deactivate', denyUnless('deactivate'), (req, res, next) => {
  try {
    const room = deactivateRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactivate', denyUnless('update'), (req, res, next) => {
  try {
    const room = reactivateRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'room not found' });
    }
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
