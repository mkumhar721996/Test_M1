const express = require('express');
const guestsStore = require('./store');

const router = express.Router();

router.get('/search', (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ error: 'query is required' });
    const includeInactive = req.query.includeInactive === 'true';
    res.status(200).json(guestsStore.searchGuests({ query: q, includeInactive }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
