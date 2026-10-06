const crypto = require('crypto');

const employees = new Map();

function createEmployee(data) {
  const employee = { ...data, id: crypto.randomUUID() };
  employees.set(employee.id, employee);
  return employee;
}

function getEmployee(id) {
  return employees.get(id);
}

function listEmployees() {
  return Array.from(employees.values());
}

function setEmploymentStatus(id, status, actor) {
  const employee = employees.get(id);
  if (!employee) return undefined;
  employee.employmentStatus = status;
  employee.history = employee.history || [];
  employee.history.push({ status, actor, at: new Date().toISOString() });
  return employee;
}

function deactivateEmployee(id, actor) {
  return setEmploymentStatus(id, 'deactivated', actor);
}

function reactivateEmployee(id, actor) {
  return setEmploymentStatus(id, 'active', actor);
}

module.exports = { createEmployee, getEmployee, listEmployees, deactivateEmployee, reactivateEmployee };
