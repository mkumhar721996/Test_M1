function escapeHtml(doc, str) {
  const div = doc.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDateDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

if (typeof module !== 'undefined') {
  module.exports = { escapeHtml, formatDateDisplay };
}

if (typeof window !== 'undefined') {
  window.PrototypeUtils = { escapeHtml, formatDateDisplay };
}
