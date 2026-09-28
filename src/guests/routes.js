const express = require('express');
const guestsStore = require('./store');
const { GuestValidationError, getGuest, updateGuest, deactivateGuest, reactivateGuest } = guestsStore;

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'roomType', 'dietary', 'communication'];

function pickPatchableFields(body) {
  return PATCHABLE_FIELDS.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

// A missing x-staff-role header is treated as "allowed" for backward compatibility with
// callers (e.g. the STORY-100 guest directory UI) that predate role-based permission checks.
function isPermitted(req) {
  const role = req.headers['x-staff-role'];
  return role === undefined || guestsStore.canCreateGuest(role);
}

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(guestsStore.listGuests());
  } catch (err) {
    next(err);
  }
});

router.get('/permission', (req, res) => {
  const role = req.headers['x-staff-role'];
  res.status(200).json({ allowed: role === undefined ? true : guestsStore.canCreateGuest(role) });
});

router.get('/match', (req, res) => {
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const match = guestsStore.findGuestMatch({ email: req.query.email, phone: req.query.phone });
  res.status(200).json({ match: match || null });
});

router.post('/', (req, res, next) => {
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const guest = guestsStore.createGuest(req.body, req.body.actor);
    res.status(201).json(guest);
  } catch (err) {
    if (err instanceof GuestValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
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
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
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
