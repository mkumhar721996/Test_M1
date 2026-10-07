const express = require('express');
const {
  createEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
} = require('./store');
const { enforceOnboardingRole } = require('../runs/auth');
const { pickFields } = require('../lib/pickFields');

const router = express.Router();

// employmentStatus is intentionally excluded: it may only change through the audited
// /deactivate and /reactivate routes below, never through this generic field editor (AC5).
const PATCHABLE_FIELDS = ['name', 'email', 'department', 'role', 'startDate'];

router.post('/', (req, res) => {
  const employee = createEmployee(req.body);
  res.status(201).json(employee);
});

router.get('/', enforceOnboardingRole, (req, res) => {
  res.status(200).json(listEmployees());
});

router.get('/:id', enforceOnboardingRole, (req, res) => {
  const employee = getEmployee(req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found' });
  }
  res.status(200).json(employee);
});

router.patch('/:id', enforceOnboardingRole, (req, res) => {
  const employee = updateEmployee(req.params.id, pickFields(req.body, PATCHABLE_FIELDS));
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  res.status(200).json(employee);
});

router.post('/:id/deactivate', enforceOnboardingRole, (req, res) => {
  const employee = deactivateEmployee(req.params.id, req.actor);
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  res.status(200).json(employee);
});

router.post('/:id/reactivate', enforceOnboardingRole, (req, res) => {
  const employee = reactivateEmployee(req.params.id, req.actor);
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  res.status(200).json(employee);
});

module.exports = router;
