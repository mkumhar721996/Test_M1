const crypto = require('crypto');
const { getDb } = require('../db/connection');

function createEmployee(data) {
  const employee = { ...data, id: crypto.randomUUID() };
  getDb().prepare('INSERT INTO employees (id, data) VALUES (?, ?)').run(employee.id, JSON.stringify(employee));
  return employee;
}

function getEmployee(id) {
  const row = getDb().prepare('SELECT data FROM employees WHERE id = ?').get(id);
  return row ? JSON.parse(row.data) : undefined;
}

module.exports = { createEmployee, getEmployee };
