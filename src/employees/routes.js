const express = require('express');
const { createEmployee, getEmployee, listEmployees, deactivateEmployee, reactivateEmployee } = require('./store');
const { enforceOnboardingRole } = require('../runs/auth');

const router = express.Router();

router.post('/', (req, res) => {
  const employee = createEmployee(req.body);
  res.status(201).json(employee);
});

router.get('/', (req, res) => {
  res.status(200).json(listEmployees());
});

router.get('/:id', (req, res) => {
  const employee = getEmployee(req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found' });
  }
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
