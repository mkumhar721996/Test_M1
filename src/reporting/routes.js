const express = require('express');
const store = require('./store');

const router = express.Router();

router.get('/hires', (req, res, next) => {
  try {
    res.status(200).json(store.listHires());
  } catch (err) {
    next(err);
  }
});

router.get('/hires/:id', (req, res, next) => {
  try {
    const detail = store.getHireDetail(req.params.id);
    if (!detail.found) {
      return res.status(404).json({ error: 'hire not found' });
    }
    if (detail.expired) {
      return res.status(410).json({ error: 'retention_expired', tombstone: detail.tombstone });
    }
    res.status(200).json(detail.hire);
  } catch (err) {
    next(err);
  }
});

router.get('/retention-settings', (req, res, next) => {
  try {
    res.status(200).json(store.getRetentionSettings());
  } catch (err) {
    next(err);
  }
});

router.put('/retention-settings', (req, res, next) => {
  const role = req.headers['x-staff-role'];
  try {
    const settings = store.updateRetentionSettings(Number(req.body.retentionMonths), req.body.actor, role);
    res.status(200).json(settings);
  } catch (err) {
    if (err instanceof store.PermissionError) {
      return res.status(403).json({ error: 'forbidden', retentionSettings: store.getRetentionSettings() });
    }
    if (err instanceof store.ValidationError) {
      return res.status(400).json({ error: 'validation_error', retentionSettings: store.getRetentionSettings() });
    }
    next(err);
  }
});

router.get('/audit-log', (req, res, next) => {
  try {
    res.status(200).json(store.listAuditLog(req.query.type));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
