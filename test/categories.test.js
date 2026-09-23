const {
  DEFAULT_CATEGORIES,
  loadCategories,
  persistCategories,
  renameCategory,
  deleteCategory,
} = require('../public/js/categories');

describe('categories module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renameCategory returns a new array with only the matching id\'s name changed', () => {
    const result = renameCategory(DEFAULT_CATEGORIES, 'meals', 'Food & Drink');
    expect(result.find((c) => c.id === 'meals').name).toBe('Food & Drink');
    expect(result.find((c) => c.id === 'travel').name).toBe('Travel');
    expect(result).not.toBe(DEFAULT_CATEGORIES);
  });

  test('deleteCategory returns a new array with the matching id removed and others untouched', () => {
    const result = deleteCategory(DEFAULT_CATEGORIES, 'meals');
    expect(result.find((c) => c.id === 'meals')).toBeUndefined();
    expect(result.length).toBe(DEFAULT_CATEGORIES.length - 1);
    expect(result.find((c) => c.id === 'travel')).toBeTruthy();
  });

  test('deleteCategory can be applied repeatedly until no categories remain, without erroring', () => {
    const emptied = DEFAULT_CATEGORIES.reduce((cats, c) => deleteCategory(cats, c.id), DEFAULT_CATEGORIES);
    expect(emptied).toEqual([]);
  });

  test('loadCategories seeds and persists the defaults on first load', () => {
    const loaded = loadCategories();
    expect(loaded).toEqual(DEFAULT_CATEGORIES);
    expect(JSON.parse(localStorage.getItem('categories'))).toEqual(DEFAULT_CATEGORIES);
  });

  test('persistCategories/loadCategories round-trip through localStorage', () => {
    const renamed = renameCategory(loadCategories(), 'travel', 'Trips');
    persistCategories(renamed);
    expect(loadCategories()).toEqual(renamed);
  });
});
