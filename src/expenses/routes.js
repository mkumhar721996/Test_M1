const express = require('express');
const { listExpenses, getExpense, deleteExpense } = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  const expenses = listExpenses();
  if (expenses.length === 0) {
    return res.status(200).json({ expenses: [], message: 'No expenses yet' });
  }
  res.status(200).json({ expenses });
});

router.delete('/:id', (req, res) => {
  const expense = getExpense(req.params.id);
  if (!expense) {
    return res.status(404).json({ error: 'expense not found' });
  }

  if (req.query.confirm !== 'true') {
    return res.status(200).json({
      id: expense.id,
      status: 'confirmation_required',
      message: 'Delete this expense permanently? This action cannot be undone.',
    });
  }

  deleteExpense(req.params.id);
  res.status(204).end();
});

module.exports = router;
