const ROLE_LABELS = {
  tenant_admin: 'Tenant Administrator',
  recruiter: 'Recruiter',
};

const METRIC_LABELS = {
  timeToFill: 'Time to fill',
  timeToOnboard: 'Time to onboard',
  shiftCompletion: 'Shift completion',
  clientRating: 'Client rating',
};

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function addMonthsIso(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const totalMonths = (m - 1) + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonthIndex0 = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(d, daysInMonth(targetYear, targetMonthIndex0));
  return `${targetYear}-${String(targetMonthIndex0 + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

function fmtDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusLabelFor(status) {
  if (status === 'active') return 'In progress';
  if (status === 'completed') return 'Completed';
  return 'Cancelled';
}

function statusBadgeClass(status) {
  if (status === 'active') return 'is-active';
  if (status === 'completed') return 'is-completed';
  return 'is-cancelled';
}

function initHiresDashboardApp(doc, initialData, api, currentUser) {
  let hires = (initialData.hires || []).slice();
  let retentionSettings = { ...initialData.retentionSettings };
  let auditLog = (initialData.auditLog || []).slice();
  let savedValue = retentionSettings.retentionMonths;
  const isAdmin = currentUser.role === 'tenant_admin';
  const roleLabel = ROLE_LABELS[currentUser.role] || currentUser.role;

  const screens = {
    dashboard: doc.getElementById('dashboard-screen'),
    detail: doc.getElementById('detail-screen'),
    settings: doc.getElementById('settings-screen'),
    audit: doc.getElementById('audit-screen'),
  };

  function makeToast(toastEl) {
    let timer = null;
    return function showToast(message) {
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { toastEl.hidden = true; }, 3200);
    };
  }
  const showDashboardToast = makeToast(doc.getElementById('dashboard-toast'));

  function signedInHtml() {
    return `Signed in as <strong>${escapeHtml(currentUser.name)}</strong> · ${escapeHtml(roleLabel)}`;
  }
  ['dashboard-signed-in', 'detail-signed-in', 'settings-signed-in', 'audit-signed-in'].forEach((id) => {
    doc.getElementById(id).innerHTML = signedInHtml();
  });

  function showScreen(name) {
    Object.keys(screens).forEach((key) => { screens[key].hidden = key !== name; });
  }

  doc.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (!navBtn) return;
    e.preventDefault();
    const target = navBtn.getAttribute('data-nav');
    if (target === 'dashboard') renderDashboard();
    if (target === 'settings') renderSettings();
    if (target === 'audit') renderAuditScreen();
    showScreen(target);
  });

  /* ---------------- Dashboard ---------------- */
  function renderHireCard(h) {
    const isRetained = h.status === 'completed' || h.status === 'cancelled';
    let statusMarkup;
    let metaMarkup;
    if (h.status === 'active') {
      statusMarkup = `<span class="status-badge ${statusBadgeClass(h.status)}">${statusLabelFor(h.status)}</span>`;
      metaMarkup = h.shiftDate ? `<span class="date-line">Next shift ${escapeHtml(fmtDisplayDate(h.shiftDate))}</span>` : '';
    } else {
      statusMarkup = `<span class="status-badge ${statusBadgeClass(h.status)}">${statusLabelFor(h.status)} · ${escapeHtml(fmtDisplayDate(h.eventDate))}</span>`;
      const expiresOn = addMonthsIso(h.eventDate, retentionSettings.retentionMonths);
      metaMarkup = `<span class="retention-chip">Expires ${escapeHtml(fmtDisplayDate(expiresOn))}</span>`;
    }
    const viewLink = isRetained ? `<button class="view-link" data-hire="${h.id}" type="button">View SLA</button>` : '';
    const card = doc.createElement('div');
    card.className = 'card hire-card';
    card.setAttribute('data-hire', h.id);
    card.innerHTML = `
      <div class="hire-identity">
        <h3>${escapeHtml(h.worker)}</h3>
        <p>${escapeHtml(h.role)} · ${escapeHtml(h.client)}</p>
        ${statusMarkup}
      </div>
      <div class="hire-meta">
        ${metaMarkup}
        ${viewLink}
      </div>`;
    return card;
  }

  function renderDashboard() {
    const hiddenCount = retentionSettings.hiddenCount || 0;
    doc.getElementById('hidden-count-text').textContent = `${hiddenCount} completed/cancelled hire${hiddenCount === 1 ? '' : 's'}`;
    doc.getElementById('retention-period-text').textContent = String(retentionSettings.retentionMonths);
    const list = doc.getElementById('hire-list');
    list.innerHTML = '';
    hires.forEach((h) => list.appendChild(renderHireCard(h)));
  }

  doc.getElementById('hire-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-link');
    if (!btn) return;
    openDetail(btn.getAttribute('data-hire'));
  });

  /* ---------------- Detail ---------------- */
  function renderDetailWithin(hire) {
    const metrics = hire.metrics || {};
    const metricsHtml = Object.keys(metrics).map((key) => `
      <div class="metric-card"><div class="value">${escapeHtml(metrics[key])}</div><div class="label">${escapeHtml(METRIC_LABELS[key] || key)}</div></div>
    `).join('');
    const expiresOn = addMonthsIso(hire.eventDate, retentionSettings.retentionMonths);
    doc.getElementById('detail-content').innerHTML = `
      <div class="page-header">
        <h1>${escapeHtml(hire.worker)}</h1>
        <p>${escapeHtml(hire.role)} · ${escapeHtml(hire.client)}</p>
      </div>
      <div class="chip-row" style="margin-bottom: var(--space-4);">
        <span class="status-badge ${statusBadgeClass(hire.status)}">${statusLabelFor(hire.status)} · ${escapeHtml(fmtDisplayDate(hire.eventDate))}</span>
      </div>
      <div class="card">
        <h3 class="card-title">SLA metrics</h3>
        <div class="sla-grid">${metricsHtml}</div>
      </div>
      <div class="retention-note">
        <span aria-hidden="true">⏳</span>
        <span>This record will remain available until <strong>${escapeHtml(fmtDisplayDate(expiresOn))}</strong>, based on your tenant's ${retentionSettings.retentionMonths}-month retention period. After that date it will be permanently deleted.</span>
      </div>`;
  }

  function renderDetailExpired(tombstone) {
    const copy = `${tombstone.worker}'s record (${tombstone.role} · ${tombstone.client}, ${tombstone.status} ${fmtDisplayDate(tombstone.eventDate)}) exceeded your tenant's ${retentionSettings.retentionMonths}-month retention period on ${fmtDisplayDate(tombstone.expiredOn)}. Its underlying data was permanently deleted on ${fmtDisplayDate(tombstone.deletedOn)} and cannot be recovered.`;
    doc.getElementById('detail-content').innerHTML = `
      <div class="card empty-state">
        <div class="icon" aria-hidden="true">🗄️</div>
        <h2>This hire's data is no longer available</h2>
        <p>${escapeHtml(copy)}</p>
        <button class="btn btn-secondary" data-nav="dashboard" type="button">Back to Hires</button>
      </div>`;
  }

  function openDetail(id) {
    api.getHireDetail(id).then((result) => {
      if (result.expired) {
        renderDetailExpired(result.tombstone);
      } else {
        renderDetailWithin(result.hire);
      }
      showScreen('detail');
    }).catch(() => {
      showDashboardToast("This hire's details could not be loaded — please try again.");
    });
  }

  doc.getElementById('detail-back-btn').addEventListener('click', () => {
    renderDashboard();
    showScreen('dashboard');
  });

  /* ---------------- Settings ---------------- */
  const input = doc.getElementById('retention-input');
  const chip = doc.getElementById('retention-chip');
  const lockBadge = doc.getElementById('lock-badge');
  const helperText = doc.getElementById('settings-helper-text');
  const saveBtn = doc.getElementById('save-btn');
  const resetBtn = doc.getElementById('reset-btn');
  const errorCallout = doc.getElementById('error-callout');
  const errorCalloutText = doc.getElementById('error-callout-text');
  const impactCallout = doc.getElementById('impact-callout');
  const impactText = doc.getElementById('impact-text');
  const modalOverlay = doc.getElementById('settings-modal-overlay');
  const modalWrap = doc.getElementById('settings-modal-wrap');
  const modalBody = doc.getElementById('settings-modal-body');
  const showToast = makeToast(doc.getElementById('settings-toast'));

  function updateChip() {
    chip.textContent = retentionSettings.isCustomized ? 'Custom' : 'Default · not customized';
  }

  function updateImpact() {
    const val = Number(input.value);
    if (isAdmin && val && val < savedValue) {
      impactCallout.hidden = false;
      impactText.textContent = `Reducing to ${val} month${val === 1 ? '' : 's'} may push existing hires past the new limit. They'll be permanently deleted at the next retention sweep — this can't be undone.`;
    } else {
      impactCallout.hidden = true;
    }
  }

  function renderSettings() {
    input.value = savedValue;
    updateChip();
    updateImpact();
    errorCallout.hidden = true;
    lockBadge.hidden = isAdmin;
    helperText.textContent = isAdmin
      ? "Applies tenant-wide to all completed and cancelled hires. Active hires are never affected."
      : 'Only a tenant administrator can change this setting. You can still view the current value.';
    doc.getElementById('recent-audit').innerHTML = auditLog
      .filter((a) => a.type === 'config')
      .slice(0, 2)
      .map(renderAuditItemHtml)
      .join('');
  }

  function closeModal() {
    modalOverlay.hidden = true;
    modalWrap.hidden = true;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }

  function openModal(newVal) {
    modalBody.textContent = `Hires older than ${newVal} months will be permanently deleted at the next retention sweep. This can't be undone.`;
    modalOverlay.hidden = false;
    modalWrap.hidden = false;
  }

  function applySuccessfulSave(newVal, settings) {
    auditLog.unshift({
      type: 'config',
      actor: currentUser.name,
      role: currentUser.role,
      timestamp: 'Just now',
      description: `changed the retention period from ${savedValue} months to ${newVal} months`,
    });
    retentionSettings = { ...retentionSettings, ...settings };
    savedValue = retentionSettings.retentionMonths;
    input.value = savedValue;
    updateChip();
    impactCallout.hidden = true;
    errorCallout.hidden = true;
    doc.getElementById('recent-audit').innerHTML = auditLog
      .filter((a) => a.type === 'config')
      .slice(0, 2)
      .map(renderAuditItemHtml)
      .join('');
    showToast(`Retention period updated to ${newVal} months.`);
  }

  function applyRejectedSave(err) {
    input.value = savedValue;
    input.classList.remove('field-flash');
    void input.offsetWidth;
    input.classList.add('field-flash');
    if (err && err.retentionSettings) {
      retentionSettings = { ...retentionSettings, ...err.retentionSettings };
      savedValue = retentionSettings.retentionMonths;
    }
    errorCalloutText.innerHTML =
      `You don't have permission to change the data retention period. Ask a tenant administrator to update it. The retention period is still <strong>${savedValue}</strong> months.`;
    errorCallout.hidden = false;
    showToast('Change rejected — administrator role required.');
  }

  function commitSave(newVal) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    return api.updateRetention(newVal).then((settings) => {
      applySuccessfulSave(newVal, settings);
    }).catch((err) => {
      applyRejectedSave(err);
    }).finally(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    });
  }

  saveBtn.addEventListener('click', () => {
    const newVal = Number(input.value);
    if (!Number.isFinite(newVal) || newVal < 1) return;
    if (isAdmin && newVal < savedValue) {
      openModal(newVal);
      doc.getElementById('settings-modal-confirm').onclick = () => { closeModal(); commitSave(newVal); };
      return;
    }
    commitSave(newVal);
  });

  resetBtn.addEventListener('click', () => {
    input.value = savedValue;
    updateImpact();
  });
  input.addEventListener('input', updateImpact);
  doc.getElementById('settings-modal-cancel').addEventListener('click', () => { closeModal(); input.value = savedValue; updateImpact(); });
  doc.getElementById('settings-modal-close').addEventListener('click', () => { closeModal(); input.value = savedValue; updateImpact(); });

  /* ---------------- Audit log ---------------- */
  function iconFor(type) {
    if (type === 'config') return '⚙️';
    if (type === 'deletion') return '🗑️';
    return '⛔';
  }
  function tagFor(type) {
    if (type === 'config') return 'Configuration change';
    if (type === 'deletion') return 'Deletion';
    return 'Access denied';
  }
  function renderAuditItemHtml(entry) {
    return `<li class="audit-item" data-type="${entry.type}">
      <span class="audit-icon" aria-hidden="true">${iconFor(entry.type)}</span>
      <div class="audit-body">
        <p><strong>${escapeHtml(entry.actor)}</strong> (${escapeHtml(ROLE_LABELS[entry.role] || entry.role)}) ${escapeHtml(entry.description)}.</p>
        <time>${escapeHtml(entry.timestamp)}</time>
        <span class="audit-tag">${tagFor(entry.type)}</span>
      </div>
    </li>`;
  }

  function renderAuditScreen() {
    doc.getElementById('full-audit-list').innerHTML = auditLog.map(renderAuditItemHtml).join('');
  }

  doc.querySelectorAll('.filter-chip').forEach((chipBtn) => {
    chipBtn.addEventListener('click', () => {
      doc.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chipBtn.classList.add('active');
      const filter = chipBtn.getAttribute('data-filter');
      doc.querySelectorAll('#full-audit-list .audit-item').forEach((item) => {
        item.style.display = (filter === 'all' || item.getAttribute('data-type') === filter) ? 'flex' : 'none';
      });
    });
  });

  renderDashboard();
  showScreen('dashboard');
}

function createDefaultApi(currentUser) {
  function headers() {
    return { 'Content-Type': 'application/json', 'x-staff-role': currentUser.role };
  }
  return {
    listHires: () => fetch('/reporting/hires').then((res) => res.json()),
    getRetentionSettings: () => fetch('/reporting/retention-settings').then((res) => res.json()),
    getAuditLog: () => fetch('/reporting/audit-log').then((res) => res.json()),
    getHireDetail: (id) => fetch(`/reporting/hires/${id}`).then((res) => {
      if (res.status === 410) return res.json().then((body) => ({ expired: true, tombstone: body.tombstone }));
      return res.json().then((hire) => ({ expired: false, hire }));
    }),
    updateRetention: (months) => fetch('/reporting/retention-settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ retentionMonths: months, actor: currentUser.name }),
    }).then((res) => {
      if (!res.ok) return res.json().then((body) => Promise.reject({ status: res.status, retentionSettings: body.retentionSettings }));
      return res.json();
    }),
  };
}

module.exports = { initHiresDashboardApp, createDefaultApi };

if (typeof window !== 'undefined') {
  const CURRENT_USER = { name: 'Jane Kim', role: 'tenant_admin' };
  window.addEventListener('DOMContentLoaded', () => {
    const api = createDefaultApi(CURRENT_USER);
    Promise.all([api.listHires(), api.getRetentionSettings(), api.getAuditLog()]).then(([hires, retentionSettings, auditLog]) => {
      initHiresDashboardApp(document, { hires, retentionSettings, auditLog }, api, CURRENT_USER);
    });
  });
}
