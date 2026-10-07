const express = require('express');
const { HireValidationError, createHire, getHire, listHires, updateHire, deactivateHire, reactivateHire, rejectHire, withdrawHire } = require('./store');

const { enforceOnboardingRole } = require('../runs/auth');
const { pickFields } = require('../lib/pickFields');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage', 'hiringManager'];

router.get('/', (req, res, next) => {
  try {
    res.status(200).json(listHires());
  } catch (err) {
    next(err);
  }
});

router.post('/', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await createHire(req.body);
    res.status(201).json(hire);
  } catch (err) {
    if (err instanceof HireValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const hire = getHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await updateHire(req.params.id, pickFields(req.body, PATCHABLE_FIELDS));
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    if (err instanceof HireValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.post('/:id/deactivate', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await deactivateHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactivate', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await reactivateHire(req.params.id);
    if (!hire) {
      return res.status(404).json({ error: 'hire not found' });
    }
    res.status(200).json(hire);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await rejectHire(req.params.id, req.body && req.body.reason);
    if (!hire) return res.status(404).json({ error: 'hire not found' });
    res.status(200).json(hire);
  } catch (err) {
    if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
    next(err);
  }
});

router.post('/:id/withdraw', enforceOnboardingRole, async (req, res, next) => {
  try {
    const hire = await withdrawHire(req.params.id, req.body && req.body.reason);
    if (!hire) return res.status(404).json({ error: 'hire not found' });
    res.status(200).json(hire);
  } catch (err) {
    if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
    next(err);
  }
});

module.exports = router;
