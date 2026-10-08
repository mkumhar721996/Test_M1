const express = require('express');
const { listAssignedJobs, assignJob } = require('./store');
const { requireAuthenticatedUser, requireDispatcherRole } = require('./auth');

const router = express.Router();

router.get('/', requireAuthenticatedUser, (req, res, next) => {
  try {
    res.status(200).json(listAssignedJobs(req.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/assign', requireDispatcherRole, (req, res, next) => {
  try {
    const body = req.body || {};
    const technicianId = typeof body.technicianId === 'string' ? body.technicianId.trim() : '';
    if (!technicianId) {
      return res.status(400).json({ error: 'validation_error', fields: { technicianId: 'technicianId is required.' } });
    }
    const job = assignJob(req.params.id, technicianId);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.status(200).json(job);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
