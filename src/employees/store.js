const crypto = require('crypto');

const employees = new Map();

function createEmployee(data, actor) {
  const { actor: _bodyActor, ...employeeData } = data;
  const employee = {
    ...employeeData,
    id: crypto.randomUUID(),
    auditLog: [{ ts: new Date().toISOString(), actor, action: 'created employee record' }],
  };
  employees.set(employee.id, employee);
  return employee;
}

function getEmployee(id) {
  return employees.get(id);
}

module.exports = { createEmployee, getEmployee };
