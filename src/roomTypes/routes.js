const express = require('express');
const { listRoomTypes } = require('./store');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listRoomTypes());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
