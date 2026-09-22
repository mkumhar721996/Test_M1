const express = require('express');
const {
  createCategory,
  getCategory,
  setCategoryLimit,
  removeCategoryLimit,
  addExpense,
  totalSpend,
} = require('./store');

const router = express.Router();

function validateLimitInput(raw) {
  const trimmed = raw === undefined || raw === null ? '' : String(raw).trim();
  if (trimmed === '') {
    return 'Enter a spend limit to save.';
  }
  const n = Number(trimmed);
  if (Number.isNaN(n)) {
    return 'Enter a valid number, e.g. 500.';
  }
  if (n <= 0) {
    return 'Spend limit must be greater than $0.';
  }
  return null;
}

function serializeCategory(category) {
  const spend = totalSpend(category);
  const hasLimit = category.limit !== null && category.limit !== undefined;
  const warning = hasLimit && spend >= category.limit;
  return {
    id: category.id,
    name: category.name,
    totalSpend: spend,
    limit: hasLimit ? category.limit : null,
    warning,
    warningLabel: warning ? (spend > category.limit ? 'Over limit' : 'At limit') : null,
  };
}

router.post('/', (req, res) => {
  const category = createCategory(req.body);
  res.status(201).json(serializeCategory(category));
});

router.get('/:id', (req, res) => {
  const category = getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'category not found' });
  }
  res.status(200).json(serializeCategory(category));
});

router.put('/:id/limit', (req, res) => {
  const category = getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'category not found' });
  }
  const error = validateLimitInput(req.body.limit);
  if (error) {
    return res.status(400).json({ error });
  }
  setCategoryLimit(req.params.id, Number(req.body.limit));
  res.status(200).json(serializeCategory(category));
});

router.delete('/:id/limit', (req, res) => {
  const category = getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'category not found' });
  }
  removeCategoryLimit(req.params.id);
  res.status(200).json(serializeCategory(category));
});

router.post('/:id/expenses', (req, res) => {
  const category = getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'category not found' });
  }
  const amount = Number(req.body.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  addExpense(req.params.id, amount);
  res.status(201).json(serializeCategory(category));
});

module.exports = router;
