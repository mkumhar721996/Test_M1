function formatCurrencyUSD(amount) {
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

if (typeof module !== 'undefined') {
  module.exports = { formatCurrencyUSD };
}
