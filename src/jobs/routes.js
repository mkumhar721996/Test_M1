const express = require('express');
const { listAssignedJobs } = require('./store');
const { requireAuthenticatedUser } = require('./auth');

const router = express.Router();

router.get('/', requireAuthenticatedUser, (req, res, next) => {
  try {
    res.status(200).json(listAssignedJobs(req.userId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
