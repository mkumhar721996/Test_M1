const express = require('express');
const { enforceOnboardingRole } = require('../runs/auth');
const { requireHrRole } = require('./auth');
const {
  LEAVE_TYPES, LeaveBalanceError, initializeBalances, getBalances, getAllBalances,
} = require('./store');

const router = express.Router();

router.get('/types', (req, res) => {
  res.status(200).json(LEAVE_TYPES);
});

router.get('/balances', enforceOnboardingRole, (req, res) => {
  res.status(200).json(getAllBalances());
});

router.post('/balances/:employeeId', requireHrRole, (req, res, next) => {
  try {
    res.status(200).json(initializeBalances(req.params.employeeId, req.body));
  } catch (err) {
    if (err instanceof LeaveBalanceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/balances/:employeeId', enforceOnboardingRole, (req, res) => {
  const record = getBalances(req.params.employeeId);
  if (!record) {
    return res.status(404).json({ error: 'no starting balance exists for this employee' });
  }
  res.status(200).json(record);
});

module.exports = router;
