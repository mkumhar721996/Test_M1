const { escapeHtml } = require('./utils');

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function initGuestSearchApp(doc, api) {
  const form = doc.getElementById('search-form');
  const input = doc.getElementById('search-input');
  const submit = doc.getElementById('search-submit');
  const fieldError = doc.getElementById('search-error');
  const includeInactive = doc.getElementById('include-inactive');
  const idle = doc.getElementById('state-idle');
  const loading = doc.getElementById('state-loading');
  const error = doc.getElementById('state-error');
  const empty = doc.getElementById('state-empty');
  const emptyHeading = doc.getElementById('state-empty-heading');
  const results = doc.getElementById('state-results');
  const resultsMeta = doc.getElementById('results-meta');
  const resultsList = doc.getElementById('results-list');

  const regions = { idle, loading, error, empty, results };

  function showRegion(name) {
    Object.values(regions).forEach((el) => { el.hidden = true; });
    regions[name].hidden = false;
  }

  function renderGuestCard(g) {
    const statusClass = g.status === 'active' ? 'is-active' : 'is-inactive';
    const statusIcon = g.status === 'active' ? '●' : '○';
    const statusLabel = g.status === 'active' ? 'Active profile' : 'Inactive profile';
    return `
      <div class="card guest-card">
        <div class="guest-avatar" aria-hidden="true">${escapeHtml(doc, initials(g.name))}</div>
        <div class="guest-main">
          <div class="guest-name-row">
            <p class="guest-name">${escapeHtml(doc, g.name)}</p>
            <span class="status-chip ${statusClass}"><span aria-hidden="true">${statusIcon}</span> ${statusLabel}</span>
          </div>
          <div class="guest-contact">
            <span>✉️ ${escapeHtml(doc, g.email)}</span>
            <span>📞 ${escapeHtml(doc, g.phone)}</span>
          </div>
        </div>
      </div>`;
  }

  function performSearch(query) {
    fieldError.hidden = true;
    const trimmed = query.trim();
    if (!trimmed) {
      fieldError.hidden = false;
      showRegion('idle');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Searching…';
    showRegion('loading');

    api.search(trimmed, includeInactive.checked).then((matches) => {
      submit.disabled = false;
      submit.textContent = 'Search';
      if (matches.length === 0) {
        emptyHeading.textContent = `No profiles found for "${trimmed}"`;
        showRegion('empty');
      } else {
        resultsMeta.textContent = `${matches.length} profile${matches.length === 1 ? '' : 's'} found`;
        resultsList.innerHTML = matches.map(renderGuestCard).join('');
        showRegion('results');
      }
    }).catch(() => {
      submit.disabled = false;
      submit.textContent = 'Search';
      showRegion('error');
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(input.value);
  });

  includeInactive.addEventListener('change', () => {
    if (input.value.trim()) performSearch(input.value);
  });
}

function createDefaultApi() {
  return {
    search: (query, includeInactiveBool) => fetch(
      `/guests/search?q=${encodeURIComponent(query)}&includeInactive=${includeInactiveBool}`,
      { headers: { 'x-staff-role': 'front_desk' } }
    ).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return res.json();
    }),
  };
}

module.exports = { initGuestSearchApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initGuestSearchApp(document, createDefaultApi());
  });
}
