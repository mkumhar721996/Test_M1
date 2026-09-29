const express = require('express');
const { getDashboard } = require('./store');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(getDashboard());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
