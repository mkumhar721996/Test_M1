const express = require('express');
const { listCategories } = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json(listCategories());
});

module.exports = router;
