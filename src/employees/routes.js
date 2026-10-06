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

// TODO(rebase): uncertain merge — STORY-170 (already merged to main) added enforceOnboardingRole
// to GET / and GET /:id so only HR/Manager can list/view employees, while STORY-171's own UI
// (public/js/employee.js, public/js/employees.js) and tests (AC6 and "GET /employees lists
// employees ungated" in test/employees-status.test.js) assume both endpoints stay open so a
// deactivated employee's status remains visible without a role header. Kept main's already-merged
// access control as the conservative choice; please confirm the intended behavior and reconcile
// the employee.js/employees.js loaders and the affected tests accordingly.
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
