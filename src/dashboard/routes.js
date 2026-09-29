const express = require('express');
const { getDashboard, canViewDashboard } = require('./store');

const router = express.Router();

// See the TEMPORARY/NOT REAL SECURITY note in ./store.js: this is an interim, client-header
// gate — not authentication — kept only because no access control is worse than this, per
// explicit security review guidance, until real session-based auth exists for the app.
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
