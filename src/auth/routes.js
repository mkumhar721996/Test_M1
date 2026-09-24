const express = require('express');
const { requestPasswordReset, verifyResetCredential, resetPassword } = require('./store');

const router = express.Router();

const ERROR_STATUS = {
  invalid_or_expired: 400,
  weak_password: 422,
  password_mismatch: 422,
};

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { channel } = await requestPasswordReset(req.body.contact);
    const message = 'If this account exists, we\'ve sent a reset link or code.';
    res.status(200).json({ message, channel });
  } catch (err) {
    next(err);
  }
});

router.post('/reset/verify', (req, res, next) => {
  try {
    const { valid } = verifyResetCredential(req.body.credential);
    if (!valid) {
      return res.status(400).json({ error: 'invalid_or_expired' });
    }
    res.status(200).json({ valid: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reset/confirm', (req, res, next) => {
  try {
    const { credential, newPassword, confirmPassword } = req.body;
    const result = resetPassword(credential, newPassword, confirmPassword);
    res.status(200).json(result);
  } catch (err) {
    if (err && err.code && ERROR_STATUS[err.code]) {
      return res.status(ERROR_STATUS[err.code]).json({ error: err.code });
    }
    next(err);
  }
});

module.exports = router;
