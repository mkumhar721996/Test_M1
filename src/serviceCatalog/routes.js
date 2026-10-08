const express = require('express');
const { listCatalog } = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json(listCatalog());
});

module.exports = router;
