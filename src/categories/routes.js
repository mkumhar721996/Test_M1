const express = require('express');
const categoryStore = require('./store');
const expenseStore = require('../expenses/store');

const router = express.Router();

function duplicateNameError(name) {
  return {
    error: 'duplicate_name',
    message: `A category named "${name.trim()}" already exists. Try a different name.`,
  };
}

router.get('/', (req, res) => {
  const categories = categoryStore.listCategories().map((c) => ({
    id: c.id,
    name: c.name,
    expenseCount: expenseStore.countByCategory(c.id),
  }));
  res.status(200).json({ categories, uncategorisedCount: expenseStore.countUncategorised() });
});

router.post('/', (req, res) => {
  const name = (req.body && req.body.name) || '';
  if (!name.trim()) {
    return res.status(422).json({ error: 'name_required', message: 'Enter a category name.' });
  }
  if (categoryStore.isNameTaken(name)) {
    return res.status(422).json(duplicateNameError(name));
  }
  const category = categoryStore.createCategory(name);
  res.status(201).json({ id: category.id, name: category.name, expenseCount: 0 });
});

router.patch('/:id', (req, res) => {
  const category = categoryStore.getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'not_found' });
  }
  const name = (req.body && req.body.name) || '';
  if (!name.trim()) {
    return res.status(422).json({ error: 'name_required', message: 'Enter a category name.' });
  }
  if (categoryStore.isNameTaken(name, category.id)) {
    return res.status(422).json(duplicateNameError(name));
  }
  const updated = categoryStore.renameCategory(category.id, name);
  res.status(200).json({
    id: updated.id,
    name: updated.name,
    expenseCount: expenseStore.countByCategory(updated.id),
  });
});

router.delete('/:id', (req, res) => {
  const category = categoryStore.getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'not_found' });
  }

  const expenseCount = expenseStore.countByCategory(category.id);
  const { resolution, targetCategoryId } = req.body || {};

  if (expenseCount === 0) {
    categoryStore.deleteCategory(category.id);
    return res.status(200).json({ deleted: true });
  }

  if (!resolution) {
    return res.status(409).json({
      error: 'resolution_required',
      expenseCount,
      otherCategories: categoryStore
        .listCategories()
        .filter((c) => c.id !== category.id)
        .map((c) => ({ id: c.id, name: c.name })),
    });
  }

  if (resolution === 'uncategorise') {
    const uncategorisedNow = expenseStore.reassignCategory(category.id, null);
    categoryStore.deleteCategory(category.id);
    return res.status(200).json({
      deleted: true,
      resolution: 'uncategorise',
      uncategorisedCount: uncategorisedNow,
    });
  }

  if (resolution === 'reassign') {
    const target = targetCategoryId && categoryStore.getCategory(targetCategoryId);
    if (!target || target.id === category.id) {
      return res.status(422).json({ error: 'invalid_target_category' });
    }
    const reassignedCount = expenseStore.reassignCategory(category.id, target.id);
    categoryStore.deleteCategory(category.id);
    return res.status(200).json({
      deleted: true,
      resolution: 'reassign',
      reassignedCount,
      targetCategoryId: target.id,
    });
  }

  return res.status(422).json({ error: 'invalid_resolution' });
});

module.exports = router;
