const express = require('express');
const { enforceOnboardingRole } = require('../runs/auth');
const {
  requireHrRole, identifyTimeOffSelf, identifyTimeOffViewer, identifyBalanceViewer,
} = require('./auth');
const {
  LEAVE_TYPES, LeaveBalanceError, initializeBalances, getBalances, getAllBalances,
} = require('./store');
const {
  TimeOffRequestError, createRequest, getRequest, listRequests, cancelRequest,
} = require('./requestsStore');

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

router.get('/balances/:employeeId', identifyBalanceViewer, (req, res) => {
  const record = getBalances(req.params.employeeId);
  if (!record) {
    return res.status(404).json({ error: 'no starting balance exists for this employee' });
  }
  res.status(200).json(record);
});

function presentRequest(record) {
  const type = LEAVE_TYPES.find((t) => t.id === record.leaveTypeId);
  return { ...record, leaveTypeName: type ? type.name : record.leaveTypeId };
}

router.post('/requests', identifyTimeOffSelf, (req, res, next) => {
  try {
    const { leaveTypeId, start, end } = req.body || {};
    res.status(201).json(presentRequest(createRequest({
      employeeId: req.employeeId, leaveTypeId, start, end,
    })));
  } catch (err) {
    if (err instanceof TimeOffRequestError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.get('/requests', identifyTimeOffViewer, (req, res) => {
  const scope = req.viewScope === 'all' ? undefined : req.employeeId;
  res.status(200).json(listRequests(scope).map(presentRequest));
});

router.post('/requests/:id/cancel', identifyTimeOffViewer, (req, res, next) => {
  try {
    const existing = getRequest(req.params.id);
    if (!existing) return res.status(404).json({ error: 'time-off request not found' });
    if (req.viewScope === 'self' && existing.employeeId !== req.employeeId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.status(200).json(presentRequest(cancelRequest(req.params.id)));
  } catch (err) {
    if (err instanceof TimeOffRequestError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
