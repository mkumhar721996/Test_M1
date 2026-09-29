const express = require('express');
const { getDashboard, canViewDashboard } = require('./store');

const router = express.Router();

function isPermitted(req) {
  return canViewDashboard(req.headers['x-staff-role']);
}

router.get('/', (req, res, next) => {
  if (!isPermitted(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    res.status(200).json(getDashboard());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
