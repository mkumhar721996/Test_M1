const express = require('express');
const { listExpenses, createExpense, updateExpense } = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    res.status(200).json(listExpenses());
  } catch (err) {
    res.status(500).json({ error: 'failed to load expenses' });
  }
});

router.post('/', (req, res) => {
  try {
    res.status(201).json(createExpense(req.body));
  } catch (err) {
    res.status(500).json({ error: 'failed to save expense' });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const updated = updateExpense(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'expense not found' });
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: 'failed to save expense' });
  }
});

module.exports = router;
