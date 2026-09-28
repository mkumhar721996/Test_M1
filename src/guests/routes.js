const express = require('express');
const guestsStore = require('./store');

const router = express.Router();

router.get('/permission', (req, res) => {
  res.status(200).json({ allowed: guestsStore.canCreateGuest(req.get('x-staff-role')) });
});

router.get('/match', (req, res) => {
  if (!guestsStore.canCreateGuest(req.get('x-staff-role'))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const match = guestsStore.findGuestMatch({ email: req.query.email, phone: req.query.phone });
  res.status(200).json({ match: match || null });
});

router.post('/', (req, res, next) => {
  if (!guestsStore.canCreateGuest(req.get('x-staff-role'))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const guest = guestsStore.createGuest(req.body);
    res.status(201).json(guest);
  } catch (err) {
    if (err instanceof guestsStore.ValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

module.exports = router;
