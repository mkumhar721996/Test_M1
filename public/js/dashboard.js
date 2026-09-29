const { escapeHtml } = require('./utils');

function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function statusChipMarkup(hire, flags) {
  if (flags.isOverdue) {
    const days = flags.overdueBy;
    return `<span class="status-chip status-chip--overdue"><span class="status-chip-icon" aria-hidden="true">⚠</span> Overdue by ${days} day${days === 1 ? '' : 's'}</span>`;
  }
  if (flags.isStalled) {
    const days = flags.daysSinceActivity;
    return `<span class="status-chip status-chip--stalled"><span class="status-chip-icon" aria-hidden="true">⏸</span> Stalled — no activity in ${days} days</span>`;
  }
  return '';
}

function initDashboardApp(doc, dashboardData) {
  let filterMode = 'all'; // 'all' | 'attention'

  const bannerSlot = doc.getElementById('banner-slot');
  const summaryEl = doc.getElementById('attention-summary');
  const filterAllBtn = doc.getElementById('filter-all-btn');
  const filterAttentionBtn = doc.getElementById('filter-attention-btn');
  const groupsEl = doc.getElementById('stage-groups');

  const drillOverlay = doc.getElementById('drill-overlay');
  const drillModal = doc.getElementById('drill-modal');
  const drillTitle = doc.getElementById('drill-modal-title');
  const drillSub = doc.getElementById('drill-modal-sub');
  const drillHireList = doc.getElementById('drill-hire-list');
  const drillCloseBtn = doc.getElementById('drill-close-btn');
  const drillDoneBtn = doc.getElementById('drill-done-btn');

  function render() {
    const stageData = dashboardData.stages;
    const totalHires = dashboardData.totalHires;
    const totalFlagged = dashboardData.totalFlagged;
    const flaggedStageCount = stageData.filter((s) => s.flaggedCount > 0).length;
    const bottlenecks = stageData.filter((s) => s.isBottleneck);

    bannerSlot.innerHTML = bottlenecks.map((b) => {
      const overdueDays = b.hires.filter((h) => h.flags.isOverdue).map((h) => h.flags.overdueBy);
      const avg = overdueDays.length ? Math.round((overdueDays.reduce((a, c) => a + c, 0) / overdueDays.length) * 10) / 10 : 0;
      return `
        <div class="bottleneck-banner" role="status">
          <span class="icon" aria-hidden="true">▲</span>
          <div>
            <h2>Bottleneck detected: ${escapeHtml(doc, b.stage.name)}</h2>
            <p>${b.flaggedCount} of ${b.hires.length} hires in this stage are overdue or stalled — average ${avg} day${avg === 1 ? '' : 's'} past the ${b.stage.slaDays}-day SLA.</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-secondary drill-trigger" data-stage="${b.stage.id}">View the ${b.flaggedCount} hires</button>
          </div>
        </div>`;
    }).join('');

    summaryEl.textContent = totalFlagged > 0
      ? `${totalFlagged} of ${totalHires} hires need attention, across ${flaggedStageCount} stage${flaggedStageCount === 1 ? '' : 's'}.`
      : `All ${totalHires} hires are within their stage's SLA — nothing needs attention right now.`;

    filterAllBtn.textContent = `All hires (${totalHires})`;
    filterAttentionBtn.textContent = `Needs attention (${totalFlagged})`;
    filterAllBtn.setAttribute('aria-pressed', String(filterMode === 'all'));
    filterAttentionBtn.setAttribute('aria-pressed', String(filterMode === 'attention'));

    groupsEl.innerHTML = stageData.map((group) => {
      const visibleHires = filterMode === 'attention'
        ? group.hires.filter((h) => h.flags.isOverdue || h.flags.isStalled)
        : group.hires;
      if (filterMode === 'attention' && visibleHires.length === 0) return '';

      const rows = visibleHires.map(({ hire, flags }) => {
        const noteLine = flags.isPartial
          ? '<p class="partial-note">Activity data unavailable — last sync failed</p>'
          : '';
        return `
          <div class="hire-row">
            <div class="hire-identity">
              <span class="hire-avatar" aria-hidden="true">${initials(hire.name)}</span>
              <div class="hire-meta">
                <p class="name">${escapeHtml(doc, hire.name)}</p>
                <p class="role">${escapeHtml(doc, hire.role)}</p>
              </div>
            </div>
            <div class="hire-progress">
              <p class="stage-line">${flags.daysInStage} day${flags.daysInStage === 1 ? '' : 's'} in ${escapeHtml(doc, group.stage.name)} · SLA ${group.stage.slaDays} day${group.stage.slaDays === 1 ? '' : 's'}</p>
              ${noteLine}
            </div>
            <div class="hire-status">${statusChipMarkup(hire, flags)}</div>
          </div>`;
      }).join('');

      return `
        <div class="stage-group card">
          <div class="stage-group-header">
            <div class="stage-group-header-title">
              <h2>${escapeHtml(doc, group.stage.name)}</h2>
              <span class="stage-count">${filterMode === 'attention' ? `${visibleHires.length} need attention` : `${group.hires.length} hire${group.hires.length === 1 ? '' : 's'} · SLA ${group.stage.slaDays}d`}</span>
            </div>
            ${group.isBottleneck ? `
              <span class="bottleneck-badge">
                <span class="icon" aria-hidden="true">⚠</span>
                Bottleneck —
                <button type="button" class="bottleneck-badge-btn drill-trigger" data-stage="${group.stage.id}">${group.flaggedCount} hires overdue in this stage</button>
              </span>` : ''}
          </div>
          <div class="hire-list">${rows || '<p class="u-text-sm u-text-muted" style="padding: var(--space-2) var(--space-4);">Nothing to show for this filter.</p>'}</div>
        </div>`;
    }).join('');

    groupsEl.querySelectorAll('.drill-trigger').forEach((btn) => {
      btn.addEventListener('click', () => openDrillModal(btn.dataset.stage));
    });
    bannerSlot.querySelectorAll('.drill-trigger').forEach((btn) => {
      btn.addEventListener('click', () => openDrillModal(btn.dataset.stage));
    });
  }

  filterAllBtn.addEventListener('click', () => { filterMode = 'all'; render(); });
  filterAttentionBtn.addEventListener('click', () => { filterMode = 'attention'; render(); });

  let lastFocusedEl = null;
  function openDrillModal(stageId) {
    const group = dashboardData.stages.find((s) => s.stage.id === stageId);
    const flaggedHires = group.hires.filter((h) => h.flags.isOverdue || h.flags.isStalled);

    drillTitle.textContent = `${group.stage.name} — systemic bottleneck`;
    drillSub.textContent = `${flaggedHires.length} hire${flaggedHires.length === 1 ? '' : 's'} in this stage ${flaggedHires.length === 1 ? 'is' : 'are'} overdue or stalled against the ${group.stage.slaDays}-day SLA.`;
    drillHireList.innerHTML = flaggedHires.map(({ hire, flags }) => `
      <div class="drill-hire-row">
        <div>
          <p class="name">${escapeHtml(doc, hire.name)}</p>
          <p class="role">${escapeHtml(doc, hire.role)}</p>
        </div>
        ${statusChipMarkup(hire, flags)}
      </div>`).join('');

    lastFocusedEl = doc.activeElement;
    drillOverlay.hidden = false;
    drillModal.hidden = false;
    drillCloseBtn.focus();
  }
  function closeDrillModal() {
    drillOverlay.hidden = true;
    drillModal.hidden = true;
    if (lastFocusedEl) lastFocusedEl.focus();
  }
  drillCloseBtn.addEventListener('click', closeDrillModal);
  drillDoneBtn.addEventListener('click', closeDrillModal);
  drillOverlay.addEventListener('click', closeDrillModal);
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drillModal.hidden) closeDrillModal();
  });

  render();
}

module.exports = { initDashboardApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    fetch('/dashboard').then((res) => res.json()).then((data) => initDashboardApp(document, data));
  });
}
