const express = require('express');
const guestsStore = require('./store');
const { requireStaffAuth } = require('../middleware/staffAuth');

const router = express.Router();

router.get('/search', requireStaffAuth, (req, res, next) => {
  const startedAt = Date.now();
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ error: 'query is required' });
    const includeInactive = req.query.includeInactive === 'true';
    const results = guestsStore.searchGuests({ query: q, includeInactive });
    // Deliberately omits the raw query (may contain guest PII like a full email/phone) from logs.
    console.log(JSON.stringify({
      action: 'guest_search',
      includeInactive,
      resultCount: results.length,
      latencyMs: Date.now() - startedAt,
    }));
    res.status(200).json(results);
  } catch (err) {
    next(err);
  }
});

router.post('/search/client-error', requireStaffAuth, (req, res) => {
  console.error(JSON.stringify({
    action: 'guest_search_client_error',
    message: (req.body && req.body.message) || 'unknown error',
  }));
  res.status(204).end();
});

module.exports = router;
