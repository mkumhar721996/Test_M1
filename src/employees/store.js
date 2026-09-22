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

module.exports = { createEmployee, getEmployee };
