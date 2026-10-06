const express = require('express');
const { createEmployee, getEmployee, updateEmployee } = require('./store');
const { enforceOnboardingRole } = require('../runs/auth');

const router = express.Router();

const PATCHABLE_FIELDS = ['name', 'email', 'department', 'role', 'startDate', 'employmentStatus'];

function pickPatchableFields(body) {
  return PATCHABLE_FIELDS.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

router.post('/', (req, res) => {
  const employee = createEmployee(req.body);
  res.status(201).json(employee);
});

router.get('/:id', enforceOnboardingRole, (req, res) => {
  const employee = getEmployee(req.params.id);
  if (!employee) {
    return res.status(404).json({ error: 'employee not found' });
  }
  res.status(200).json(employee);
});

router.patch('/:id', enforceOnboardingRole, (req, res) => {
  const employee = updateEmployee(req.params.id, pickPatchableFields(req.body));
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  res.status(200).json(employee);
});

module.exports = router;
