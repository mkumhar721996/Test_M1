const crypto = require('crypto');
const { getDb } = require('../db/connection');

function listExpenses() {
  return getDb().prepare('SELECT data FROM expenses ORDER BY rowid DESC')
    .all().map((r) => JSON.parse(r.data));
}

function createExpense(data) {
  const expense = { ...data, id: 'exp_' + crypto.randomUUID() };
  getDb().prepare('INSERT INTO expenses (id, data) VALUES (?, ?)').run(expense.id, JSON.stringify(expense));
  return expense;
}

function updateExpense(id, changes) {
  const row = getDb().prepare('SELECT data FROM expenses WHERE id = ?').get(id);
  if (!row) return undefined;
  const updated = { ...JSON.parse(row.data), ...changes, id };
  getDb().prepare('UPDATE expenses SET data = ? WHERE id = ?').run(JSON.stringify(updated), id);
  return updated;
}

module.exports = { listExpenses, createExpense, updateExpense };
