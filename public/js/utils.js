(function () {
  function escapeHtml(doc, str) {
    const div = doc.createElement('div');
    div.textContent = str === null || str === undefined ? '' : str;
    return div.innerHTML;
  }

  function formatDateDisplay(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${m}/${d}/${y}`;
  }

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hidden);
  }

  function trapTab(doc, panel, e) {
    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (doc.activeElement === first || !panel.contains(doc.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (doc.activeElement === last || !panel.contains(doc.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  const utilsExports = {
    escapeHtml, formatDateDisplay, getFocusableElements, trapTab,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utilsExports;
  }
  if (typeof window !== 'undefined') {
    window.EmployeeUtils = utilsExports;
  }
}());
