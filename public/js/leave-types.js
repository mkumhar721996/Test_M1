function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initLeaveTypesApp(doc, api) {
  const region = doc.getElementById('leave-types-region');
  const preview = doc.getElementById('preview-leave-type');

  return Promise.resolve(api.list()).then((types) => {
    region.innerHTML = `<div class="leave-type-grid">${types.map((t) => `
      <div class="card leave-type-card">
        <span class="chip fixed-chip">Fixed — not configurable</span>
        <h3 class="card-title">${escapeHtml(t.name)}</h3>
        <p class="card-body">${escapeHtml(t.description)}</p>
        <div class="default-balance">Default starting balance: <strong>${escapeHtml(t.defaultBalance)} days</strong></div>
      </div>`).join('')}</div>`;
    preview.innerHTML = types.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
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
