const crypto = require('crypto');

const categories = new Map();

function listCategories() {
  return Array.from(categories.values());
}

function getCategory(id) {
  return categories.get(id);
}

function isNameTaken(name, excludeId) {
  const normalized = name.trim().toLowerCase();
  return listCategories().some(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === normalized
  );
}

function createCategory(name) {
  const category = { id: crypto.randomUUID(), name: name.trim() };
  categories.set(category.id, category);
  return category;
}

function renameCategory(id, name) {
  const category = categories.get(id);
  if (!category) return undefined;
  category.name = name.trim();
  return category;
}

function deleteCategory(id) {
  return categories.delete(id);
}

module.exports = {
  listCategories,
  getCategory,
  isNameTaken,
  createCategory,
  renameCategory,
  deleteCategory,
};
