const { escapeHtml, formatDateDisplay } = require('./utils');

const MANAGER = 'Morgan Ellis';
const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'People Ops', 'Finance'];
const ALL_FIELDS = ['name', 'email', 'phone', 'department', 'role', 'startDate'];
const TASKS_TOTAL = 5;

function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validateCandidate(data) {
  const fields = {};
  if (!data.name || !data.name.trim()) fields.name = "Enter the candidate's full name.";
  if (!data.email || !isValidEmail(data.email)) fields.email = 'Enter a valid email address.';
  if (!data.phone || !data.phone.trim()) fields.phone = 'Enter a valid phone number.';
  if (!data.department) fields.department = 'Select a department.';
  if (!data.role || !data.role.trim()) fields.role = "Enter the candidate's role.";
  if (!data.startDate) fields.startDate = 'Choose a start date.';
  return fields;
}

function departmentOptionsMarkup(doc, selected) {
  return '<option value="">Select department…</option>' +
    DEPARTMENTS.map((d) => `<option value="${escapeHtml(doc, d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(doc, d)}</option>`).join('');
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusChipMarkup(status) {
  return status === 'active'
    ? '<span class="profile-status-chip profile-status-chip--active"><span aria-hidden="true">●</span> Active</span>'
    : '<span class="profile-status-chip"><span aria-hidden="true">○</span> Deactivated</span>';
}

function runStatusLabel(run) {
  if (!run) return '<span aria-hidden="true">○</span> No run';
  if (run.status === 'active') return '<span aria-hidden="true">●</span> Active';
  if (run.status === 'cancelled') return '<span aria-hidden="true">✕</span> Cancelled';
  return '<span aria-hidden="true">✓</span> Completed';
}

function runChipClass(run) {
  if (!run) return 'status-chip status-chip--none';
  if (run.status === 'active') return 'status-chip status-chip--active';
  if (run.status === 'cancelled') return 'status-chip status-chip--cancelled';
  return 'status-chip status-chip--completed';
}

function setBusy(btn, busyLabel, idleLabel) {
  btn.disabled = true;
  btn.dataset.idleLabel = idleLabel;
  btn.textContent = busyLabel;
}

function clearBusy(btn) {
  btn.disabled = false;
  btn.textContent = btn.dataset.idleLabel || btn.textContent;
}

function initCandidatesApp(doc, initialCandidates, api) {
  let candidates = initialCandidates.slice();
  let currentId = null;
  let lastMutationTs = null;
  let historyOpen = false;
  let toastTimer = null;
  let profToastTimer = null;

  const directoryScreen = doc.getElementById('cand-directory-screen');
  const profileScreen = doc.getElementById('cand-profile-screen');
  const emptyState = doc.getElementById('cand-empty-state');
  const tableWrap = doc.getElementById('cand-table-wrap');
  const tbody = doc.getElementById('cand-tbody');
  const searchInput = doc.getElementById('cand-search-input');
  const resultsCount = doc.getElementById('cand-results-count');
  const noResults = doc.getElementById('cand-no-results');

  doc.getElementById('cand-f-department').innerHTML = departmentOptionsMarkup(doc, '');
  doc.getElementById('cand-ef-department').innerHTML = departmentOptionsMarkup(doc, '');

  function showToast(msg) {
    const toast = doc.getElementById('cand-toast');
    doc.getElementById('cand-toast-message').textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }
  function showProfToast(msg) {
    const toast = doc.getElementById('cand-prof-toast');
    doc.getElementById('cand-prof-toast-message').textContent = msg;
    toast.hidden = false;
    clearTimeout(profToastTimer);
    profToastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
  }

  function findCandidate(id) {
    return candidates.find((c) => c.id === id);
  }

  function clearFieldErrors(fieldIdFn, errorIdFn) {
    ALL_FIELDS.forEach((f) => {
      const err = doc.getElementById(errorIdFn(f));
      const input = doc.getElementById(fieldIdFn(f));
      if (err) { err.hidden = true; err.textContent = ''; }
      if (input) input.classList.remove('input-error');
    });
  }
  function applyFieldErrors(fieldIdFn, errorIdFn, errors) {
    Object.keys(errors).forEach((f) => {
      const err = doc.getElementById(errorIdFn(f));
      const input = doc.getElementById(fieldIdFn(f));
      if (err) { err.hidden = false; err.textContent = `⚠ ${errors[f]}`; }
      if (input) input.classList.add('input-error');
    });
  }
  function readForm(fieldIdFn) {
    return {
      name: doc.getElementById(fieldIdFn('name')).value.trim(),
      email: doc.getElementById(fieldIdFn('email')).value.trim(),
      phone: doc.getElementById(fieldIdFn('phone')).value.trim(),
      department: doc.getElementById(fieldIdFn('department')).value,
      role: doc.getElementById(fieldIdFn('role')).value.trim(),
      startDate: doc.getElementById(fieldIdFn('startDate')).value,
    };
  }
  const createFieldId = (f) => `cand-f-${f}`;
  const createErrorId = (f) => `cand-e-${f}`;
  const editFieldId = (f) => `cand-ef-${f}`;
  const editErrorId = (f) => `cand-ee-${f}`;

  // ---------------- Directory ----------------
  function renderDirectory() {
    if (candidates.length === 0) {
      emptyState.hidden = false;
      tableWrap.hidden = true;
      noResults.hidden = true;
      resultsCount.textContent = '';
      tbody.innerHTML = '';
      return;
    }
    emptyState.hidden = true;

    const q = searchInput.value.trim().toLowerCase();
    const filtered = candidates.filter((c) => {
      if (!q) return true;
      return [c.name, c.email, c.role, c.department].some((v) => String(v).toLowerCase().includes(q));
    });

    resultsCount.textContent = `${filtered.length} candidate${filtered.length === 1 ? '' : 's'}${q ? ` matching "${q}"` : ' in the pipeline'}`;
    tableWrap.hidden = filtered.length === 0;
    noResults.hidden = filtered.length !== 0;

    tbody.innerHTML = filtered.map((c) => {
      const last = c.auditLog && c.auditLog.length ? c.auditLog[c.auditLog.length - 1] : null;
      return `
        <tr class="candidate-row" data-id="${c.id}">
          <td><span class="candidate-name-cell">${escapeHtml(doc, c.name)}</span><span class="candidate-id">${escapeHtml(doc, c.id)}</span></td>
          <td>${escapeHtml(doc, c.role)}<span class="candidate-id">${escapeHtml(doc, c.department)}</span></td>
          <td>${c.hireStage === 'offer_accepted' ? 'Offer accepted' : 'Draft'}</td>
          <td>${statusChipMarkup(c.profileStatus)}</td>
          <td>${last ? formatDateDisplay(last.ts.slice(0, 10)) : '—'}</td>
          <td class="col-actions"><button class="view-link-btn" type="button" data-id="${c.id}">View →</button></td>
        </tr>
      `;
    }).join('');
  }

  tbody.addEventListener('click', (e) => {
    const target = e.target.closest('[data-id]');
    if (target) openProfile(target.getAttribute('data-id'));
  });

  searchInput.addEventListener('input', renderDirectory);

  function openProfile(id) {
    currentId = id;
    historyOpen = false;
    renderProfile();
    directoryScreen.hidden = true;
    profileScreen.hidden = false;
  }

  doc.getElementById('cand-back-btn').addEventListener('click', () => {
    directoryScreen.hidden = false;
    profileScreen.hidden = true;
    renderDirectory();
  });

  // ---------------- Profile ----------------
  function renderProfile() {
    const c = findCandidate(currentId);
    if (!c) return;

    doc.getElementById('cand-prof-name').textContent = c.name;
    doc.getElementById('cand-prof-meta').textContent = `${c.id} · ${c.email}`;

    const statusChip = doc.getElementById('cand-prof-status-chip');
    statusChip.className = 'profile-status-chip' + (c.profileStatus === 'active' ? ' profile-status-chip--active' : '');
    statusChip.innerHTML = c.profileStatus === 'active'
      ? '<span aria-hidden="true">●</span> Active'
      : '<span aria-hidden="true">○</span> Deactivated';

    doc.getElementById('cand-deactivated-banner').hidden = c.profileStatus !== 'deactivated';
    doc.getElementById('cand-deactivate-btn').hidden = c.profileStatus !== 'active';
    doc.getElementById('cand-reactivate-btn').hidden = c.profileStatus !== 'deactivated';
    doc.getElementById('cand-reinstate-guard').hidden = c.profileStatus !== 'active';
    doc.getElementById('cand-reject-guard').hidden = c.profileStatus !== 'deactivated';

    doc.getElementById('cand-kv-list').innerHTML = `
      <div class="kv-row"><span class="kv-label">Email</span><span class="kv-value">${escapeHtml(doc, c.email)}</span></div>
      <div class="kv-row"><span class="kv-label">Phone</span><span class="kv-value">${escapeHtml(doc, c.phone)}</span></div>
      <div class="kv-row"><span class="kv-label">Department</span><span class="kv-value">${escapeHtml(doc, c.department)}</span></div>
      <div class="kv-row"><span class="kv-label">Role</span><span class="kv-value">${escapeHtml(doc, c.role)}</span></div>
      <div class="kv-row"><span class="kv-label">Start date</span><span class="kv-value">${escapeHtml(doc, formatDateDisplay(c.startDate))}</span></div>
      <div class="kv-row"><span class="kv-label">Hire stage</span><span class="kv-value">${c.hireStage === 'offer_accepted' ? 'Offer accepted ✓' : 'Draft'}</span></div>
    `;

    const runChip = doc.getElementById('cand-run-chip');
    runChip.className = runChipClass(c.run);
    runChip.innerHTML = runStatusLabel(c.run);

    const runBody = doc.getElementById('cand-run-body');
    if (c.run) {
      const totalTasks = c.run.totalTasks || TASKS_TOTAL;
      const pct = Math.round((c.run.tasksDone / totalTasks) * 100);
      runBody.innerHTML = `
        <div class="run-meta-row"><span class="k">Run ID</span><span class="v">${escapeHtml(doc, c.run.id)}</span></div>
        <div class="run-meta-row"><span class="k">Started</span><span class="v">${c.run.startedAt ? formatDateTime(c.run.startedAt) : '—'}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
        <p class="progress-label">${c.run.tasksDone} of ${totalTasks} onboarding tasks complete</p>
        ${c.run.freshStart ? '<span class="fresh-start-tag"><span aria-hidden="true">↻</span> Fresh run after reinstatement</span>' : ''}
      `;
    } else {
      runBody.innerHTML = `<p class="no-run-note">${c.profileStatus === 'deactivated' ? 'No active run — cancelled when this candidate was rejected.' : 'No run yet. A run starts automatically once hire stage is set to "Offer accepted".'}</p>`;
    }

    const runHistory = c.runHistory || [];
    doc.getElementById('cand-history-count').textContent = runHistory.length;
    const historyList = doc.getElementById('cand-history-list');
    historyList.hidden = !historyOpen;
    doc.getElementById('cand-history-toggle').setAttribute('aria-expanded', String(historyOpen));
    historyList.innerHTML = runHistory.length
      ? runHistory.map((r) => `<li class="history-item">${escapeHtml(doc, r.id)} — <span class="status-chip status-chip--cancelled" style="display:inline-flex;">✕ Cancelled</span> · ${r.reason === 'profile_deactivated' ? 'cancelled when candidate was rejected' : 'cancelled'}</li>`).join('')
      : '<li class="history-item">No earlier runs.</li>';

    const auditLog = c.auditLog || [];
    doc.getElementById('cand-audit-list').innerHTML = auditLog.slice().reverse().map((a) => `
      <li class="audit-item">
        <span class="audit-actor">${escapeHtml(doc, a.actor)}</span> <span class="audit-action">${escapeHtml(doc, a.action)}</span>
        — ${formatDateTime(a.ts)}${a.ts === lastMutationTs ? '<span class="audit-just-now">Just now</span>' : ''}
      </li>
    `).join('');
  }

  doc.getElementById('cand-history-toggle').addEventListener('click', () => {
    historyOpen = !historyOpen;
    renderProfile();
  });

  // ---------------- Create candidate (AC2, validation shared with AC9) ----------------
  const createOverlay = doc.getElementById('cand-create-overlay');
  const createModal = doc.getElementById('cand-create-modal');
  const createForm = doc.getElementById('cand-create-form');
  const createSaveBtn = doc.getElementById('cand-create-save-btn');

  function openCreateModal() {
    createForm.reset();
    doc.getElementById('cand-f-department').value = '';
    doc.getElementById('cand-f-hireStage').value = 'draft';
    clearFieldErrors(createFieldId, createErrorId);
    createOverlay.hidden = false;
    createModal.hidden = false;
    doc.getElementById('cand-f-name').focus();
  }
  function closeCreateModal() {
    createOverlay.hidden = true;
    createModal.hidden = true;
  }

  doc.getElementById('cand-add-btn').addEventListener('click', openCreateModal);
  doc.getElementById('cand-empty-add-btn').addEventListener('click', openCreateModal);
  doc.getElementById('cand-create-close-btn').addEventListener('click', closeCreateModal);
  doc.getElementById('cand-create-cancel-btn').addEventListener('click', closeCreateModal);
  createOverlay.addEventListener('click', closeCreateModal);

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (createSaveBtn.disabled) return;

    const data = readForm(createFieldId);
    const errors = validateCandidate(data);
    clearFieldErrors(createFieldId, createErrorId);
    if (Object.keys(errors).length > 0) {
      applyFieldErrors(createFieldId, createErrorId, errors);
      return;
    }

    const hireStage = doc.getElementById('cand-f-hireStage').value;
    setBusy(createSaveBtn, 'Creating…', 'Create candidate');
    api.create({ ...data, hireStage }).then((candidate) => {
      candidates.push(candidate);
      if (candidate.auditLog && candidate.auditLog.length) {
        lastMutationTs = candidate.auditLog[candidate.auditLog.length - 1].ts;
      }
      clearBusy(createSaveBtn);
      closeCreateModal();
      searchInput.value = '';
      renderDirectory();
      showToast(`${candidate.name} added to the pipeline — status active.`);
    }).catch(() => {
      clearBusy(createSaveBtn);
      showToast('Candidate could not be created — please try again.');
    });
  });

  // ---------------- Edit candidate (AC6 save / AC9 validation) ----------------
  const editOverlay = doc.getElementById('cand-edit-overlay');
  const editModal = doc.getElementById('cand-edit-modal');
  const editForm = doc.getElementById('cand-edit-form');
  const editSaveBtn = doc.getElementById('cand-edit-save-btn');
  const editBannerError = doc.getElementById('cand-edit-banner-error');

  function openEditModal() {
    const c = findCandidate(currentId);
    clearFieldErrors(editFieldId, editErrorId);
    editBannerError.hidden = true;
    doc.getElementById('cand-ef-name').value = c.name;
    doc.getElementById('cand-ef-email').value = c.email;
    doc.getElementById('cand-ef-phone').value = c.phone;
    doc.getElementById('cand-ef-department').value = c.department;
    doc.getElementById('cand-ef-role').value = c.role;
    doc.getElementById('cand-ef-startDate').value = c.startDate;
    editOverlay.hidden = false;
    editModal.hidden = false;
    doc.getElementById('cand-ef-name').focus();
  }
  function closeEditModal() {
    editOverlay.hidden = true;
    editModal.hidden = true;
  }

  doc.getElementById('cand-edit-btn').addEventListener('click', openEditModal);
  doc.getElementById('cand-edit-close-btn').addEventListener('click', closeEditModal);
  doc.getElementById('cand-edit-cancel-btn').addEventListener('click', closeEditModal);
  editOverlay.addEventListener('click', closeEditModal);

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (editSaveBtn.disabled) return;

    const data = readForm(editFieldId);
    const errors = validateCandidate(data);
    clearFieldErrors(editFieldId, editErrorId);
    if (Object.keys(errors).length > 0) {
      applyFieldErrors(editFieldId, editErrorId, errors);
      editBannerError.hidden = false;
      return; // AC9: rejected, record unchanged, modal stays open with entered values intact
    }
    editBannerError.hidden = true;

    const c = findCandidate(currentId);
    const changes = {};
    ALL_FIELDS.forEach((f) => { if (String(c[f]) !== String(data[f])) changes[f] = data[f]; });

    if (Object.keys(changes).length === 0) {
      closeEditModal();
      showProfToast('No changes to save.');
      return;
    }

    setBusy(editSaveBtn, 'Saving…', 'Save changes');
    api.update(currentId, changes).then((updated) => {
      const idx = candidates.findIndex((cc) => cc.id === updated.id);
      if (idx !== -1) candidates[idx] = updated;
      if (updated.auditLog && updated.auditLog.length) {
        lastMutationTs = updated.auditLog[updated.auditLog.length - 1].ts;
      }
      clearBusy(editSaveBtn);
      closeEditModal();
      renderProfile();
      showProfToast(`Saved changes to ${updated.name}.`);
    }).catch(() => {
      clearBusy(editSaveBtn);
      showProfToast('Changes could not be saved — please try again.');
    });
  });

  // ---------------- Reject / deactivate (AC3, AC4) ----------------
  const deactivateOverlay = doc.getElementById('cand-deactivate-overlay');
  const deactivateModal = doc.getElementById('cand-deactivate-modal');
  const deactivateConfirmBtn = doc.getElementById('cand-deactivate-confirm-btn');

  function openDeactivateModal() {
    const c = findCandidate(currentId);
    doc.getElementById('cand-deactivate-copy').textContent =
      c.run && c.run.status === 'active'
        ? `Rejecting ${c.name} sets their status to deactivated and cancels their active onboarding run (${c.run.id}). You can reinstate them later — reinstating starts a fresh run.`
        : `Rejecting ${c.name} sets their status to deactivated. You can reinstate them later — reinstating starts a fresh run.`;
    deactivateOverlay.hidden = false;
    deactivateModal.hidden = false;
  }
  function closeDeactivateModal() {
    deactivateOverlay.hidden = true;
    deactivateModal.hidden = true;
  }

  doc.getElementById('cand-deactivate-btn').addEventListener('click', openDeactivateModal);
  doc.getElementById('cand-deactivate-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('cand-deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);

  deactivateConfirmBtn.addEventListener('click', () => {
    if (deactivateConfirmBtn.disabled) return;
    const c = findCandidate(currentId);
    setBusy(deactivateConfirmBtn, 'Rejecting…', 'Reject candidate');
    api.deactivate(c.id).then((updated) => {
      const idx = candidates.findIndex((cc) => cc.id === updated.id);
      if (idx !== -1) candidates[idx] = updated;
      if (updated.auditLog && updated.auditLog.length) {
        lastMutationTs = updated.auditLog[updated.auditLog.length - 1].ts;
      }
      clearBusy(deactivateConfirmBtn);
      closeDeactivateModal();
      renderProfile();
      showProfToast(`${updated.name} was rejected. Status: deactivated.`);
    }).catch(() => {
      clearBusy(deactivateConfirmBtn);
      closeDeactivateModal();
      showProfToast('Rejection could not be completed — please try again.');
    });
  });

  // ---------------- Reinstate / reactivate (AC5) ----------------
  const reactivateOverlay = doc.getElementById('cand-reactivate-overlay');
  const reactivateModal = doc.getElementById('cand-reactivate-modal');
  const reactivateConfirmBtn = doc.getElementById('cand-reactivate-confirm-btn');

  function openReactivateModal() {
    const c = findCandidate(currentId);
    doc.getElementById('cand-reactivate-copy').textContent =
      `Reinstating ${c.name} sets their status back to active. A new onboarding run starts from the beginning — the previous run is not resumed.`;
    reactivateOverlay.hidden = false;
    reactivateModal.hidden = false;
  }
  function closeReactivateModal() {
    reactivateOverlay.hidden = true;
    reactivateModal.hidden = true;
  }

  doc.getElementById('cand-reactivate-btn').addEventListener('click', openReactivateModal);
  doc.getElementById('cand-reactivate-close-btn').addEventListener('click', closeReactivateModal);
  doc.getElementById('cand-reactivate-cancel-btn').addEventListener('click', closeReactivateModal);
  reactivateOverlay.addEventListener('click', closeReactivateModal);

  reactivateConfirmBtn.addEventListener('click', () => {
    if (reactivateConfirmBtn.disabled) return;
    const c = findCandidate(currentId);
    setBusy(reactivateConfirmBtn, 'Reinstating…', 'Reinstate candidate');
    api.reactivate(c.id).then((updated) => {
      const idx = candidates.findIndex((cc) => cc.id === updated.id);
      if (idx !== -1) candidates[idx] = updated;
      if (updated.auditLog && updated.auditLog.length) {
        lastMutationTs = updated.auditLog[updated.auditLog.length - 1].ts;
      }
      clearBusy(reactivateConfirmBtn);
      closeReactivateModal();
      renderProfile();
      showProfToast(`${updated.name} was reinstated. A fresh onboarding run has started.`);
    }).catch(() => {
      clearBusy(reactivateConfirmBtn);
      closeReactivateModal();
      showProfToast('Reinstatement could not be completed — please try again.');
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!createModal.hidden) closeCreateModal();
    if (!editModal.hidden) closeEditModal();
    if (!deactivateModal.hidden) closeDeactivateModal();
    if (!reactivateModal.hidden) closeReactivateModal();
  });

  renderDirectory();
}

function createDefaultApi() {
  function jsonRequest(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return res.json();
    });
  }

  return {
    list: () => fetch('/hires').then((res) => res.json()),
    get: (id) => fetch(`/hires/${id}`).then((res) => res.json()),
    create: (data) => jsonRequest('/hires', 'POST', { ...data, actor: MANAGER }),
    update: (id, changes) => jsonRequest(`/hires/${id}`, 'PATCH', { ...changes, actor: MANAGER }),
    deactivate: (id) => jsonRequest(`/hires/${id}/deactivate`, 'POST', { actor: MANAGER }),
    reactivate: (id) => jsonRequest(`/hires/${id}/reactivate`, 'POST', { actor: MANAGER }),
  };
}

module.exports = { initCandidatesApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const api = createDefaultApi();
    api.list().then((candidates) => initCandidatesApp(document, candidates, api));
  });
}
