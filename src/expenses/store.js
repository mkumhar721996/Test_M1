const crypto = require('crypto');

const expenses = new Map();

function createExpense(data) {
  const expense = { categoryId: null, ...data, id: crypto.randomUUID() };
  expenses.set(expense.id, expense);
  return expense;
}

function listExpenses() {
  return Array.from(expenses.values());
}

function countByCategory(categoryId) {
  return listExpenses().filter((e) => e.categoryId === categoryId).length;
}

function countUncategorised() {
  return countByCategory(null);
}

function reassignCategory(fromCategoryId, toCategoryId) {
  let count = 0;
  expenses.forEach((expense) => {
    if (expense.categoryId === fromCategoryId) {
      expense.categoryId = toCategoryId;
      count += 1;
    }
  });
  return count;
}

module.exports = {
  createExpense,
  listExpenses,
  countByCategory,
  countUncategorised,
  reassignCategory,
};
