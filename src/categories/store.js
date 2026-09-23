const crypto = require('crypto');

const categories = new Map();

function createCategory(data) {
  const category = { id: crypto.randomUUID(), name: data.name, limit: null, expenses: [] };
  categories.set(category.id, category);
  return category;
}

function getCategory(id) {
  return categories.get(id);
}

function setCategoryLimit(id, limit) {
  const category = categories.get(id);
  category.limit = limit;
}

function removeCategoryLimit(id) {
  const category = categories.get(id);
  category.limit = null;
}

function addExpense(id, amount) {
  const category = categories.get(id);
  category.expenses.push(amount);
}

function totalSpend(category) {
  return category.expenses.reduce((sum, amount) => sum + amount, 0);
}

module.exports = {
  createCategory,
  getCategory,
  setCategoryLimit,
  removeCategoryLimit,
  addExpense,
  totalSpend,
};
