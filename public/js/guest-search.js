const { escapeHtml } = typeof require !== 'undefined' ? require('./utils') : window.PrototypeUtils;

function statusChipMarkup(status) {
  if (status === 'active') {
    return '<span class="status-chip is-active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 13l4 4L19 7"></path></svg>Active</span>';
  }
  return '<span class="status-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>Inactive</span>';
}

function initGuestSearchApp(doc, api) {
  let searchedYet = false;
  let currentRequestId = 0;

  const queryInput = doc.getElementById('search-query');
  const includeInactive = doc.getElementById('include-inactive');
  const emptyError = doc.getElementById('empty-query-error');
  const resultsPanel = doc.getElementById('results-panel');
  const resultCount = doc.getElementById('result-count');
  const searchForm = doc.getElementById('search-form');
  const searchBtn = doc.getElementById('search-btn');

  function renderLoading() {
    const rows = [1, 2, 3].map(() => '<tr class="skeleton-row"><td colspan="4"><div class="skeleton-bar"></div></td></tr>').join('');
    resultsPanel.innerHTML = `<div class="table-scroll"><table class="guest-table"><tbody>${rows}</tbody></table></div>`;
    resultCount.textContent = 'Searching…';
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching…';
  }

  function renderError() {
    resultsPanel.innerHTML = `
      <div class="state-panel error-panel" role="alert">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 4.3L2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a1.5 1.5 0 0 0-2.6 0z"></path></svg>
        <p class="state-title">Search is unavailable</p>
        <p class="state-body">We couldn't reach the guest directory. No results can be shown right now — please try your search again in a moment.</p>
      </div>
    `;
    resultCount.textContent = '';
  }

  function renderNoResults(query) {
    resultsPanel.innerHTML = `
      <div class="state-panel">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="M20 20l-4.35-4.35"></path></svg>
        <p class="state-title">No profiles found</p>
        <p class="state-body">No guest profiles matched &ldquo;${escapeHtml(doc, query)}&rdquo;. Check the spelling, or try a different name, email, or phone number.</p>
      </div>
    `;
    resultCount.textContent = '0 profiles found';
  }

  function renderResults(results, elapsedMs) {
    const rows = results.map((g) => `
      <tr>
        <td class="guest-name">${escapeHtml(doc, g.name)}</td>
        <td>${escapeHtml(doc, g.email)}</td>
        <td>${escapeHtml(doc, g.phone)}</td>
        <td class="col-status">${statusChipMarkup(g.status)}</td>
      </tr>
    `).join('');
    resultsPanel.innerHTML = `
      <div class="table-scroll">
        <table class="guest-table">
          <thead><tr><th>Guest</th><th>Email</th><th>Phone</th><th class="col-status">Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    resultCount.textContent = `${results.length}${results.length === 1 ? ' profile found' : ' profiles found'} — responded in ${elapsedMs}ms`;
  }

  function reportClientError(message) {
    if (typeof fetch !== 'function') return;
    try {
      fetch('/guests/search/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }).catch(() => {});
    } catch (_) {
      // best-effort telemetry; never block the UI
    }
  }

  function performSearch(rawQuery) {
    emptyError.hidden = true;
    const query = rawQuery.trim();
    if (!query) {
      emptyError.hidden = false;
      queryInput.focus();
      return;
    }
    searchedYet = true;
    renderLoading();
    const requestId = ++currentRequestId;
    const started = performance.now();
    api.search(query, includeInactive.checked).then((results) => {
      if (requestId !== currentRequestId) return;
      const elapsed = Math.round(performance.now() - started);
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
      if (results.length === 0) renderNoResults(query);
      else renderResults(results, elapsed);
    }).catch((err) => {
      if (requestId !== currentRequestId) return;
      reportClientError(err && err.message);
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
      renderError();
    });
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(queryInput.value);
  });

  includeInactive.addEventListener('change', () => {
    if (searchedYet && queryInput.value.trim()) {
      performSearch(queryInput.value);
    }
  });
}

function createDefaultApi() {
  return {
    search: (query, includeInactiveBool) => fetch(`/guests/search?q=${encodeURIComponent(query)}&includeInactive=${includeInactiveBool}`)
      .then((res) => {
        if (!res.ok) throw new Error('search failed');
        return res.json();
      }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { initGuestSearchApp };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initGuestSearchApp(document, createDefaultApi());
  });
}
