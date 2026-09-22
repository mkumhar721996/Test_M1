function validateExpenseForm(values) {
  const errors = {};
  if (!values.amount) errors.amount = 'Amount is required.';
  if (!values.date) errors.date = 'Date is required.';
  if (!values.category) errors.category = 'Category is required.';
  return { valid: Object.keys(errors).length === 0, errors };
}

if (typeof module !== 'undefined') {
  module.exports = { validateExpenseForm };
}
