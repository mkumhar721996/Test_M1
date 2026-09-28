const express = require('express');
const { getDashboardData } = require('./store');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await getDashboardData();
    res.status(200).json(result);
  } catch (err) {
    res.status(503).json({ error: 'arc pipeline integration unavailable' });
  }
});

module.exports = router;
