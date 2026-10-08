const express = require('express');
const { getAvailability, setAvailability, listAvailability } = require('./store');
const { requireAuthenticatedUser, requireDispatcherRole } = require('./auth');

const router = express.Router();

router.get('/me', requireAuthenticatedUser, (req, res, next) => {
  try {
    res.status(200).json(getAvailability(req.userId));
  } catch (err) {
    next(err);
  }
});

router.put('/me', requireAuthenticatedUser, (req, res, next) => {
  try {
    const { available } = req.body || {};
    if (typeof available !== 'boolean') {
      return res.status(400).json({ error: 'validation_error', fields: { available: 'available must be a boolean.' } });
    }
    res.status(200).json(setAvailability(req.userId, available));
  } catch (err) {
    next(err);
  }
});

router.get('/', requireDispatcherRole, (req, res, next) => {
  try {
    res.status(200).json(listAvailability());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
