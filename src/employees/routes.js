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

const PATCHABLE_FIELDS = ['name', 'email', 'department', 'role', 'startDate', 'employmentStatus'];

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

// TODO(rebase): uncertain merge — STORY-170 added this generic PATCH (with 'employmentStatus'
// among PATCHABLE_FIELDS) so HR/Manager can set arbitrary status values as one of six editable
// fields, while STORY-171's AC5 asserts no generic route should ever write employmentStatus
// (status changes must go through /deactivate and /reactivate so they are audit-logged in
// employee.history). Kept main's already-merged generic PATCH behavior intact; please confirm
// whether employmentStatus should be removed from PATCHABLE_FIELDS to satisfy AC5.
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
