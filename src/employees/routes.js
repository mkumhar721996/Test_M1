const express = require('express');
const { createEmployee, getEmployee, updateEmployee, listEmployees } = require('./store');
const { enforceOnboardingRole } = require('../runs/auth');
const { pickFields } = require('../lib/pickFields');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'department', 'role', 'startDate', 'employmentStatus'];

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

module.exports = router;
