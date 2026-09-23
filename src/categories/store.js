const CATEGORIES = [
  { id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600.00 },
  { id: 'cat-2', name: 'Dining Out', totalSpend: 310.00, spendLimit: 250.00 },
  { id: 'cat-3', name: 'Transportation', totalSpend: 128.50, spendLimit: null },
  { id: 'cat-4', name: 'Entertainment', totalSpend: 75.00, spendLimit: 75.00 },
  { id: 'cat-5', name: 'Utilities', totalSpend: 210.40, spendLimit: 300.00 },
  { id: 'cat-6', name: 'Software Subscriptions', totalSpend: 89.99, spendLimit: null },
];

function listCategories() {
  return CATEGORIES.map((c) => ({ ...c }));
}

module.exports = { listCategories };
