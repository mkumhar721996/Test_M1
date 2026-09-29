const express = require('express');
const { getDashboard } = require('./store');

const router = express.Router();

// No access control here: this app has no session/login system anywhere (grep the repo —
// there is no req.user, no cookie, no token verification on any route), so a client-supplied
// header cannot provide real authorization — it's trivially forgeable by whoever sends the
// request and would only simulate security while doing nothing to stop it. Gating this route
// on such a header was flagged and removed; restricting HR-admin access to this endpoint for
// real requires adding genuine session-based authentication across the app, which is a
// dedicated cross-cutting initiative, not something this story can safely bolt on.
router.get('/', (req, res, next) => {
  try {
    res.status(200).json(getDashboard());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
