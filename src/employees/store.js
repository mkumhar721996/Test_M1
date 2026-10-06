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

function updateEmployee(id, changes) {
  const employee = employees.get(id);
  if (!employee) return undefined;
  Object.assign(employee, changes);
  return employee;
}

module.exports = { createEmployee, getEmployee, updateEmployee };
