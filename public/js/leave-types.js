const { escapeHtml } = require('./utils');

function initLeaveTypesApp(doc, api) {
  const region = doc.getElementById('leave-types-region');
  const preview = doc.getElementById('preview-leave-type');

  return Promise.resolve(api.list()).then((types) => {
    region.innerHTML = `<div class="leave-type-grid">${types.map((t) => `
      <div class="card leave-type-card">
        <span class="chip fixed-chip">Fixed — not configurable</span>
        <h3 class="card-title">${escapeHtml(doc, t.name)}</h3>
        <p class="card-body">${escapeHtml(doc, t.description)}</p>
        <div class="default-balance">Default starting balance: <strong>${escapeHtml(doc, t.defaultBalance)} days</strong></div>
      </div>`).join('')}</div>`;
    preview.innerHTML = types.map((t) => `<option value="${escapeHtml(doc, t.id)}">${escapeHtml(doc, t.name)}</option>`).join('');
  }, () => {
    region.innerHTML = '<div class="error-state"><h3>Couldn\'t load leave types</h3><p>Something went wrong — reload the page to try again.</p></div>';
  });
}

function createLeaveTypesApi() {
  return {
    list: () => fetch('/leave/types').then((res) => (res.ok ? res.json() : Promise.reject({ status: res.status }))),
  };
}

if (typeof module !== 'undefined') module.exports = { initLeaveTypesApp, createLeaveTypesApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initLeaveTypesApp(document, createLeaveTypesApi()));
}
