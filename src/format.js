export function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}

export function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
