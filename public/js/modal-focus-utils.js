function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.hidden);
}

function trapModalTab(doc, panel, e) {
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

function createModalKeydownHandler(doc, panel, onEscape) {
  return function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
    } else if (e.key === 'Tab') {
      trapModalTab(doc, panel, e);
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { getFocusableElements, trapModalTab, createModalKeydownHandler };
}
if (typeof window !== 'undefined') {
  window.ModalFocusUtils = { getFocusableElements, trapModalTab, createModalKeydownHandler };
}
