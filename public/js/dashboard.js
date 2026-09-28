const { escapeHtml } = require('./utils');

function initDashboardApp(doc, initialPayload, api) {
  let payload = initialPayload;
  let toastTimer = null;

  const staleBanner = doc.getElementById('stale-banner');
  const staleBannerText = doc.getElementById('stale-banner-text');
  const pipelineTbody = doc.getElementById('pipeline-tbody');
  const refreshBtn = doc.getElementById('refresh-btn');
  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');

  function showToast(message) {
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function renderBanner() {
    staleBanner.hidden = !payload.stale;
    staleBanner.classList.toggle('stale-banner--significant', Boolean(payload.significantlyStale));
    if (!payload.stale) return;

    staleBannerText.textContent = payload.significantlyStale
      ? `Arc integration is degraded — data may be significantly out of date. Last successful fetch: ${payload.lastFetchedAt}.`
      : `Arc integration is unavailable — showing cached data. Last successful fetch: ${payload.lastFetchedAt}.`;
  }

  function renderTable() {
    const rows = payload.data || [];
    if (rows.length === 0) {
      pipelineTbody.innerHTML = '<tr><td colspan="3">No pipeline data available.</td></tr>';
      return;
    }
    pipelineTbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(doc, row.name || row.hireId)}</td>
        <td>${escapeHtml(doc, row.stage)}</td>
        <td>${escapeHtml(doc, row.updatedAt || '')}</td>
      </tr>
    `).join('');
  }

  function renderAll() {
    renderBanner();
    renderTable();
  }

  refreshBtn.addEventListener('click', () => {
    api.fetchDashboard().then((fresh) => {
      payload = fresh;
      renderAll();
    }).catch(() => {
      showToast('Could not refresh pipeline data — please try again');
    });
  });

  renderAll();
}

function createDefaultApi() {
  return {
    fetchDashboard: () => fetch('/dashboard').then((res) => res.json()),
  };
}

module.exports = { initDashboardApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const api = createDefaultApi();
    api.fetchDashboard().then((initialPayload) => initDashboardApp(document, initialPayload, api)).catch(() => {
      document.getElementById('pipeline-tbody').innerHTML = '<tr><td colspan="3">Pipeline data is unavailable right now — please try again later.</td></tr>';
    });
  });
}
