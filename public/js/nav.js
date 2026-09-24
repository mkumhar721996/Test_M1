const HASH_TO_SECTION = {
  '#/expenses': 'expenses',
  '#/employees': 'employees',
};

function activateSection(doc, sectionName) {
  doc.querySelectorAll('.app-section').forEach((section) => {
    section.hidden = section.dataset.section !== sectionName;
  });

  doc.querySelectorAll('[data-nav]').forEach((link) => {
    const isActive = link.dataset.nav === sectionName;
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function initNav(doc = document) {
  const win = doc.defaultView;

  doc.querySelectorAll('[data-nav]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activateSection(doc, link.dataset.nav);
      win.location.hash = '#/' + link.dataset.nav;
    });
  });

  win.addEventListener('hashchange', () => {
    const sectionName = HASH_TO_SECTION[win.location.hash] || 'expenses';
    activateSection(doc, sectionName);
  });

  const initialSection = HASH_TO_SECTION[win.location.hash] || 'expenses';
  activateSection(doc, initialSection);
}

module.exports = { initNav, activateSection, HASH_TO_SECTION };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initNav());
}
