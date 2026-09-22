const crypto = require('crypto');

const expenses = new Map();

function createExpense(data) {
  const expense = { ...data, id: crypto.randomUUID() };
  expenses.set(expense.id, expense);
  return expense;
}

function listExpenses(ownerId) {
  return Array.from(expenses.values()).filter((expense) => expense.ownerId === ownerId);
}

function getExpense(id) {
  return expenses.get(id);
}

function deleteExpense(id) {
  return expenses.delete(id);
}

function clearExpenses() {
  expenses.clear();
}

module.exports = { createExpense, listExpenses, getExpense, deleteExpense, clearExpenses };
