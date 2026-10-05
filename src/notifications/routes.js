const express = require('express');
const { listDeliveryLog } = require('./store');

const router = express.Router();

router.get('/delivery-log', (req, res) => {
  const { runId, status } = req.query;
  res.status(200).json(listDeliveryLog({ runId, status }));
});

module.exports = router;
