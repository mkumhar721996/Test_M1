const express = require('express');
const guestsStore = require('./store');
const { verifyStaffToken } = require('../auth/staffSession');
const { getRoleForStaffId } = require('../auth/staffDirectory');

const router = express.Router();

// Role is always re-derived server-side from the staff directory, never taken
// from the (signed) session token's own claims or any client-supplied header,
// so a revoked/changed role takes effect without waiting for tokens to expire.
function resolveStaffRole(req) {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return undefined;
  const session = verifyStaffToken(token);
  if (!session) return undefined;
  return getRoleForStaffId(session.staffId);
}

router.get('/permission', (req, res) => {
  res.status(200).json({ allowed: guestsStore.canCreateGuest(resolveStaffRole(req)) });
});

router.get('/match', (req, res) => {
  if (!guestsStore.canCreateGuest(resolveStaffRole(req))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const match = guestsStore.findGuestMatch({ email: req.query.email, phone: req.query.phone });
  res.status(200).json({ match: match || null });
});

router.post('/', (req, res, next) => {
  if (!guestsStore.canCreateGuest(resolveStaffRole(req))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const guest = guestsStore.createGuest(req.body);
    res.status(201).json(guest);
  } catch (err) {
    if (err instanceof guestsStore.ValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

module.exports = router;
