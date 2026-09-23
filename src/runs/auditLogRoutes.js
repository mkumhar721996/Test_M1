const express = require('express');
const auditLog = require('./auditLog');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json(auditLog.list());
});

module.exports = router;
