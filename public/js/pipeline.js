const ARC_HOSTNAME = 'arc.example.com';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const TASKS_TOTAL = 5;

function isValidArcUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === ARC_HOSTNAME;
  } catch {
    return false;
  }
}

const DISABLED_ARC_LINK_MARKUP = `
  <button class="btn btn-secondary arc-link-btn" type="button" disabled aria-disabled="true">
    <span aria-hidden="true">↗</span> View run in arc
  </button>
  <p class="arc-link-caption">Not clickable yet — available once arc issues a run URL for this hire.</p>
`;

function arcLinkMarkup(doc, run) {
  if (!run) {
    return `
      <p class="arc-link-absent"><strong>No arc run yet.</strong> A deep link will appear here once this hire’s pipeline starts.</p>
    `;
  }
  if (!run.arcRunUrl || !isValidArcUrl(run.arcRunUrl)) {
    return DISABLED_ARC_LINK_MARKUP;
  }
  // Built via real DOM properties (not string interpolation) so the browser's own
  // attribute serializer — not manual escaping — governs how the URL ends up in the
  // markup, closing off quote/attribute-breakout injection through arcRunUrl.
  const link = doc.createElement('a');
  link.className = 'btn btn-secondary arc-link-btn';
  link.href = run.arcRunUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('data-arc-link', '');
  link.innerHTML = '<span aria-hidden="true">↗</span> View run in arc';
  return `
    ${link.outerHTML}
    <p class="arc-link-caption">Opens in a new tab using this run's own URL — no onboarding credentials are shared.</p>
  `;
}

function statusLabel(hire) {
  if (hire.profileStatus !== 'active') return 'Deactivated';
  if (!hire.run) return hire.hireStage === 'offer_accepted' ? 'Starting' : 'Draft';
  if (hire.run.status === 'active') return 'In progress';
  if (hire.run.status === 'cancelled') return 'Cancelled';
  return hire.run.status;
}

function initPipelineApp(doc, initialHires) {
  let hires = initialHires.slice();

  const dashboardScreen = doc.getElementById('dashboard-screen');
  const detailScreen = doc.getElementById('detail-screen');
  const hireListEl = doc.getElementById('hire-list');
  const dashboardEmptyEl = doc.getElementById('dashboard-empty');
  const detailBodyEl = doc.getElementById('detail-body');
  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');

  let toastTimer = null;
  function showToast(message) {
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function renderDashboard() {
    if (hires.length === 0) {
      hireListEl.innerHTML = '';
      dashboardEmptyEl.hidden = false;
      return;
    }
    dashboardEmptyEl.hidden = true;

    hireListEl.innerHTML = `<div class="hire-list">${hires.map((hire) => `
      <div class="card hire-row">
        <div class="hire-main">
          <div class="hire-name-row">
            <span class="hire-name">${escapeHtml(hire.name)}</span>
            <span class="hire-status-label u-text-sm u-text-muted">${escapeHtml(statusLabel(hire))}</span>
          </div>
          <p class="hire-role">${escapeHtml(hire.role)}${hire.department ? ` — ${escapeHtml(hire.department)}` : ''}</p>
          <button class="open-detail-btn" type="button" data-open-detail="${hire.id}">View pipeline detail →</button>
        </div>
        <div class="arc-link-cell">${arcLinkMarkup(doc, hire.run)}</div>
      </div>
    `).join('')}</div>`;

    hireListEl.querySelectorAll('[data-open-detail]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-open-detail')));
    });
    bindArcLinkToasts(hireListEl);
  }

  function bindArcLinkToasts(scope) {
    scope.querySelectorAll('[data-arc-link]').forEach((link) => {
      link.addEventListener('click', () => showToast('Opening arc’s run view in a new tab…'));
    });
  }

  function openDetail(hireId) {
    const hire = hires.find((h) => h.id === hireId);
    if (!hire) return;
    renderDetail(hire);
    dashboardScreen.hidden = true;
    detailScreen.hidden = false;
  }

  function renderDetail(hire) {
    detailBodyEl.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${escapeHtml(hire.name)}</h1>
          <p>${escapeHtml(hire.role)}${hire.department ? ` — ${escapeHtml(hire.department)}` : ''}</p>
        </div>
        <span class="hire-status-label u-text-sm u-text-muted">${escapeHtml(statusLabel(hire))}</span>
      </div>

      <div class="layout-grid">
        <div class="card">
          <h2 class="card-title">Onboarding summary</h2>
          <p class="u-text-sm u-text-muted" style="margin:0 0 var(--space-3) 0;">Owned entirely by onboarding — arc has no controls here.</p>
          <div class="summary-row"><span class="k">Hire stage</span><span class="v">${escapeHtml(hire.hireStage === 'offer_accepted' ? 'Offer accepted' : 'Draft')}</span></div>
          <div class="summary-row"><span class="k">Profile status</span><span class="v">${escapeHtml(hire.profileStatus === 'active' ? 'Active' : 'Deactivated')}</span></div>
          <div class="summary-row"><span class="k">Tasks complete</span><span class="v">${hire.run ? `${hire.run.tasksDone} of ${TASKS_TOTAL}` : '—'}</span></div>
        </div>

        <div class="card">
          <h2 class="card-title">Arc pipeline run</h2>
          <p class="u-text-sm u-text-muted" style="margin:0 0 var(--space-3) 0;">Arc runs and scores this hire's onboarding pipeline.</p>
          ${hire.run && hire.run.id ? `<div class="summary-row"><span class="k">Run ID</span><span class="v">${escapeHtml(hire.run.id)}</span></div>` : ''}
          <div style="margin-top: var(--space-3);">${arcLinkMarkup(doc, hire.run)}</div>

          <div class="boundary-card">
            <p><span aria-hidden="true">⊘</span> Re-run, prompt tuning, and eval scoring are never embedded or proxied here — they only exist in arc, reached via the link above.</p>
          </div>
          <div class="security-note">
            <span aria-hidden="true">🔒</span>
            <span>Opening the link passes no onboarding credentials or session tokens to arc — only the run's own URL.</span>
          </div>
        </div>
      </div>
    `;

    bindArcLinkToasts(detailBodyEl);
  }

  doc.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
    detailScreen.hidden = true;
    dashboardScreen.hidden = false;
  });

  renderDashboard();
}

function createDefaultApi() {
  return {
    listHires: () => fetch('/hires').then((res) => res.json()),
  };
}

module.exports = { initPipelineApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    createDefaultApi().listHires().then((hires) => initPipelineApp(document, hires));
  });
}
