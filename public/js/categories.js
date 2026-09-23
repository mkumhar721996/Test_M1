const CATEGORIES_STORAGE_KEY = 'categories';

const DEFAULT_CATEGORIES = [
  { id: 'travel', name: 'Travel' },
  { id: 'meals', name: 'Meals' },
  { id: 'software', name: 'Software' },
  { id: 'office-supplies', name: 'Office Supplies' },
  { id: 'other', name: 'Other' },
];

function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore malformed storage */ }
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
  } catch (e) { /* storage unavailable — fall back to in-memory defaults */ }
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

function persistCategories(list) {
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
}

function renameCategory(categories, id, newName) {
  return categories.map((c) => (c.id === id ? { ...c, name: newName } : c));
}

function deleteCategory(categories, id) {
  return categories.filter((c) => c.id !== id);
}

if (typeof module !== 'undefined') {
  module.exports = {
    CATEGORIES_STORAGE_KEY,
    DEFAULT_CATEGORIES,
    loadCategories,
    persistCategories,
    renameCategory,
    deleteCategory,
  };
}
