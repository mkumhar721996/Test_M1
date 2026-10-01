const express = require('express');
const usersStore = require('../users/store');
const { createSession, destroySession, tokenFromRequest } = require('./sessions');

const router = express.Router();

router.post('/sign-in', (req, res) => {
  const { email, password } = req.body || {};
  const result = usersStore.authenticate(email, password);
  if (!result.ok && result.reason === 'deactivated') {
    return res.status(403).json({ error: 'account_deactivated', message: 'This account has been deactivated. Contact an administrator for access.' });
  }
  if (!result.ok) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
  }
  const { id, name, email: userEmail, roles } = result.user;
  res.status(200).json({ id, name, email: userEmail, roles, token: createSession(id) });
});

router.post('/sign-out', (req, res) => {
  const token = tokenFromRequest(req);
  if (token) destroySession(token);
  res.status(204).end();
});

module.exports = router;
