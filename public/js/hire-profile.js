const TASKS_TOTAL = 5;
const DEMO_HIRE_ID = 'hire_2031';

function escapeHtml(doc, str) {
  const div = doc.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDateDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function workflowName(dept, role) {
  return `${dept} — ${role}`;
}

function statusChipMarkup(status) {
  if (status === 'pending') return '<span aria-hidden="true">⏳</span> Pending';
  if (status === 'active') return '<span class="status-dot" aria-hidden="true">●</span> Active';
  if (status === 'cancelled') return '<span aria-hidden="true">✕</span> Cancelled';
  if (status === 'completed') return '<span aria-hidden="true">✓</span> Completed';
  return '<span aria-hidden="true">○</span> No Run';
}

function initHireProfileApp(doc, initialHire, api) {
  let hire = { ...initialHire };
  let historyOpen = false;
  let toastTimer = null;
  let pendingRoleChange = null;

  const headingEl = doc.getElementById('hire-name-heading');
  const pendingBanner = doc.getElementById('pending-banner');
  const pendingBannerText = doc.getElementById('pending-banner-text');
  const fieldset = doc.getElementById('profile-fieldset');
  const profileStatusChip = doc.getElementById('profile-status-chip');
  const kvList = doc.getElementById('kv-list');
  const topActions = doc.getElementById('top-actions');
  const runStatusChip = doc.getElementById('run-status-chip');
  const runBody = doc.getElementById('run-body');
  const historyToggleBtn = doc.getElementById('history-toggle-btn');
  const historyList = doc.getElementById('history-list');
  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');

  const contactOverlay = doc.getElementById('contact-overlay');
  const contactModal = doc.getElementById('contact-modal');
  const contactForm = doc.getElementById('contact-form');
  const contactSaveBtn = doc.getElementById('contact-save-btn');

  const roleOverlay = doc.getElementById('role-overlay');
  const roleModal = doc.getElementById('role-modal');
  const roleForm = doc.getElementById('role-form');
  const roleConfirmStep = doc.getElementById('role-confirm-step');
  const roleConfirmCopy = doc.getElementById('role-confirm-copy');

  const deactivateOverlay = doc.getElementById('deactivate-overlay');
  const deactivateModal = doc.getElementById('deactivate-modal');

  const reactivateOverlay = doc.getElementById('reactivate-overlay');
  const reactivateModal = doc.getElementById('reactivate-modal');

  function showToast(message) {
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function setPending(isPending, label) {
    pendingBanner.hidden = !isPending;
    if (label) pendingBannerText.textContent = label;
    fieldset.disabled = isPending;
    renderTopActions();
  }

  function renderAll() {
    renderProfile();
    renderTopActions();
    renderRunCard();
  }

  function renderProfile() {
    if (headingEl) headingEl.textContent = hire.name;

    profileStatusChip.className = 'profile-status-chip' + (hire.profileStatus === 'active' ? ' profile-status-chip--active' : '');
    profileStatusChip.innerHTML = hire.profileStatus === 'active'
      ? '<span aria-hidden="true">●</span> Active profile'
      : '<span aria-hidden="true">○</span> Deactivated';

    const stageLabel = hire.hireStage === 'offer_accepted' ? 'Offer accepted' : 'Draft';
    const canEditStage = hire.hireStage !== 'offer_accepted' && hire.profileStatus === 'active';

    kvList.innerHTML = `
      <div class="kv-row">
        <span class="kv-label">Name</span>
        <span class="kv-value">${escapeHtml(doc, hire.name)}</span>
        <span class="kv-actions"></span>
      </div>
      <div class="kv-row">
        <span class="kv-label">Email</span>
        <span class="kv-value">${escapeHtml(doc, hire.email)}</span>
        <span class="kv-actions"></span>
      </div>
      <div class="kv-row">
        <span class="kv-label">Phone</span>
        <span class="kv-value">${escapeHtml(doc, hire.phone)}</span>
        <span class="kv-actions"></span>
      </div>
      <div class="kv-row">
        <span class="kv-label">Start date</span>
        <span class="kv-value">${formatDateDisplay(hire.startDate)}</span>
        <span class="kv-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="edit-contact-btn" ${hire.profileStatus !== 'active' ? 'disabled' : ''}>Edit start date &amp; contact</button>
        </span>
      </div>
      <div class="kv-row">
        <span class="kv-label">Department</span>
        <span class="kv-value">${escapeHtml(doc, hire.department)}</span>
        <span class="kv-actions"></span>
      </div>
      <div class="kv-row">
        <span class="kv-label">Role</span>
        <span class="kv-value">${escapeHtml(doc, hire.role)}</span>
        <span class="kv-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="edit-role-btn" ${hire.profileStatus !== 'active' ? 'disabled' : ''}>Edit role &amp; department</button>
        </span>
      </div>
      <div class="kv-row" style="border-bottom:none;">
        <span class="kv-label">Hire stage</span>
        <span class="kv-value">
          ${canEditStage
            ? `<select class="input" id="field-hire-stage" style="max-width:220px; display:inline-block;">
                 <option value="draft" ${hire.hireStage === 'draft' ? 'selected' : ''}>Draft</option>
                 <option value="offer_accepted" ${hire.hireStage === 'offer_accepted' ? 'selected' : ''}>Offer accepted</option>
               </select>`
            : `${stageLabel} ${hire.hireStage === 'offer_accepted' ? '✓' : ''}`}
        </span>
        <span class="kv-actions">
          ${canEditStage ? '<button class="btn btn-primary btn-sm" type="button" id="save-stage-btn">Save profile</button>' : ''}
        </span>
      </div>
    `;

    const editContactBtn = doc.getElementById('edit-contact-btn');
    if (editContactBtn) editContactBtn.addEventListener('click', openContactModal);
    const editRoleBtn = doc.getElementById('edit-role-btn');
    if (editRoleBtn) editRoleBtn.addEventListener('click', openRoleModal);
    const saveStageBtn = doc.getElementById('save-stage-btn');
    if (saveStageBtn) saveStageBtn.addEventListener('click', handleSaveStage);
  }

  function renderTopActions() {
    const locked = pendingBanner.hidden === false;
    if (hire.profileStatus === 'active') {
      topActions.innerHTML = `<button class="btn btn-secondary" type="button" id="deactivate-btn" ${locked ? 'disabled' : ''}>Deactivate profile</button>`;
      const btn = doc.getElementById('deactivate-btn');
      if (btn) btn.addEventListener('click', openDeactivateModal);
    } else {
      topActions.innerHTML = `<button class="btn btn-primary" type="button" id="reactivate-btn" ${locked ? 'disabled' : ''}>Reactivate profile</button>`;
      const btn = doc.getElementById('reactivate-btn');
      if (btn) btn.addEventListener('click', openReactivateModal);
    }
  }

  function renderRunCard() {
    const run = hire.run;

    if (!run) {
      runStatusChip.className = 'status-chip status-chip--none';
      runStatusChip.innerHTML = statusChipMarkup('none');
      runBody.innerHTML = '<p class="no-run-note">No Run yet. Set hire stage to "Offer accepted" and save the profile to trigger one.</p>';
      renderHistory();
      return;
    }

    runStatusChip.className = 'status-chip status-chip--' + run.status;
    runStatusChip.innerHTML = statusChipMarkup(run.status);

    const pct = Math.round((run.tasksDone / TASKS_TOTAL) * 100);
    runBody.innerHTML = `
      <div class="run-meta">
        <div class="run-meta-row"><span class="k">Run ID</span><span class="v">${run.id}</span></div>
        <div class="run-meta-row"><span class="k">Reflects</span><span class="v">${escapeHtml(doc, workflowName(run.department, run.role))}</span></div>
        ${run.startedAt ? `<div class="run-meta-row"><span class="k">Started</span><span class="v">${run.startedAt}</span></div>` : ''}
      </div>
      <div class="progress-track"><div class="progress-fill" style="width: ${pct}%;"></div></div>
      <p class="progress-label">${run.tasksDone} of ${TASKS_TOTAL} tasks complete</p>
      ${run.freshStart ? '<span class="fresh-start-tag"><span aria-hidden="true">↺</span> Started from the beginning</span>' : ''}
    `;
    renderHistory();
  }

  function renderHistory() {
    const history = hire.runHistory || [];
    historyToggleBtn.setAttribute('aria-expanded', String(historyOpen));
    historyToggleBtn.innerHTML = `Run history (<span id="history-count">${history.length}</span>) ${historyOpen ? '▴' : '▾'}`;

    if (history.length === 0) {
      historyList.innerHTML = '<li class="history-empty">No previous Runs.</li>';
    } else {
      historyList.innerHTML = history.slice().reverse().map((h) => `
        <li class="history-item">
          <div class="history-item-head">
            <span class="history-item-id">${h.id} — ${escapeHtml(doc, workflowName(h.department, h.role))}</span>
            <span class="status-chip status-chip--cancelled">${statusChipMarkup('cancelled')}</span>
          </div>
          <p class="history-item-body">Reason: ${escapeHtml(doc, (h.reason || '').replace(/_/g, ' '))}. Reached ${h.tasksDone} of ${TASKS_TOTAL} tasks before cancellation.</p>
          <span class="not-resumed-note"><span aria-hidden="true">⊘</span> Not resumed — a new Run was created instead</span>
        </li>
      `).join('');
    }
    historyList.hidden = !historyOpen;
  }

  historyToggleBtn.addEventListener('click', () => {
    historyOpen = !historyOpen;
    renderHistory();
  });

  // ---------- Contact & start date modal (AC4, AC5 — never pending) ----------
  function openContactModal() {
    doc.getElementById('field-name').value = hire.name;
    doc.getElementById('field-email').value = hire.email;
    doc.getElementById('field-phone').value = hire.phone;
    doc.getElementById('field-start-date').value = hire.startDate;
    contactOverlay.hidden = false;
    contactModal.hidden = false;
  }
  function closeContactModal() {
    contactOverlay.hidden = true;
    contactModal.hidden = true;
  }
  doc.getElementById('contact-close-btn').addEventListener('click', closeContactModal);
  doc.getElementById('contact-cancel-btn').addEventListener('click', closeContactModal);
  contactOverlay.addEventListener('click', closeContactModal);

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const changes = {
      name: doc.getElementById('field-name').value.trim(),
      email: doc.getElementById('field-email').value.trim(),
      phone: doc.getElementById('field-phone').value.trim(),
      startDate: doc.getElementById('field-start-date').value,
    };
    contactSaveBtn.disabled = true;
    contactSaveBtn.textContent = 'Saving…';
    api.updateContact(changes).then((updated) => {
      hire = updated;
      contactSaveBtn.disabled = false;
      contactSaveBtn.textContent = 'Save changes';
      closeContactModal();
      renderAll();
      showToast('Profile updated — onboarding Run unaffected');
    }).catch(() => {
      contactSaveBtn.disabled = false;
      contactSaveBtn.textContent = 'Save changes';
      showToast('Profile could not be saved — please try again');
    });
  });

  // ---------- Role & department modal (AC2, AC3, AC9) ----------
  function openRoleModal() {
    doc.getElementById('field-department').value = hire.department;
    doc.getElementById('field-role').value = hire.role;
    roleForm.hidden = false;
    roleConfirmStep.hidden = true;
    roleOverlay.hidden = false;
    roleModal.hidden = false;
  }
  function closeRoleModal() {
    roleOverlay.hidden = true;
    roleModal.hidden = true;
  }
  doc.getElementById('role-close-btn').addEventListener('click', closeRoleModal);
  doc.getElementById('role-cancel-btn').addEventListener('click', closeRoleModal);
  roleOverlay.addEventListener('click', closeRoleModal);
  doc.getElementById('role-back-btn').addEventListener('click', () => {
    roleForm.hidden = false;
    roleConfirmStep.hidden = true;
  });

  roleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    pendingRoleChange = {
      department: doc.getElementById('field-department').value,
      role: doc.getElementById('field-role').value.trim() || hire.role,
    };
    const hasActiveRun = Boolean(hire.run && hire.run.status === 'active');
    roleConfirmCopy.textContent = hasActiveRun
      ? 'Change role or department? The current onboarding Run will be cancelled and a new Run will start reflecting the update.'
      : 'Change role or department? This will be saved to the profile.';
    roleForm.hidden = true;
    roleConfirmStep.hidden = false;
  });

  doc.getElementById('role-confirm-btn').addEventListener('click', () => {
    const change = pendingRoleChange;
    closeRoleModal();
    setPending(true, 'Cancelling current Run and starting a new one…');
    api.updateRoleDepartment(change).then((updated) => {
      hire = updated;
      setPending(false);
      renderAll();
      showToast('Onboarding Run restarted for new role/department');
    }).catch(() => {
      setPending(false);
      renderAll();
      showToast('Role & department change could not be saved — please try again');
    });
  });

  // ---------- Deactivate modal (AC6, AC9) ----------
  function openDeactivateModal() {
    deactivateOverlay.hidden = false;
    deactivateModal.hidden = false;
  }
  function closeDeactivateModal() {
    deactivateOverlay.hidden = true;
    deactivateModal.hidden = true;
  }
  doc.getElementById('deactivate-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);

  doc.getElementById('deactivate-confirm-btn').addEventListener('click', () => {
    closeDeactivateModal();
    setPending(true, 'Cancelling onboarding Run…');
    api.deactivate().then((updated) => {
      hire = updated;
      setPending(false);
      renderAll();
      showToast('Profile deactivated — onboarding Run cancelled');
    }).catch(() => {
      setPending(false);
      renderAll();
      showToast('Deactivation could not be completed — please try again');
    });
  });

  // ---------- Reactivate modal (AC7, AC8, AC9) ----------
  function openReactivateModal() {
    reactivateOverlay.hidden = false;
    reactivateModal.hidden = false;
  }
  function closeReactivateModal() {
    reactivateOverlay.hidden = true;
    reactivateModal.hidden = true;
  }
  doc.getElementById('reactivate-close-btn').addEventListener('click', closeReactivateModal);
  doc.getElementById('reactivate-cancel-btn').addEventListener('click', closeReactivateModal);
  reactivateOverlay.addEventListener('click', closeReactivateModal);

  doc.getElementById('reactivate-confirm-btn').addEventListener('click', () => {
    closeReactivateModal();
    setPending(true, 'Starting a fresh onboarding Run…');
    api.reactivate().then((updated) => {
      hire = updated;
      setPending(false);
      renderAll();
      showToast('Profile reactivated — new onboarding Run started');
    }).catch(() => {
      setPending(false);
      renderAll();
      showToast('Reactivation could not be completed — please try again');
    });
  });

  // ---------- Hire stage save (AC1, AC9) ----------
  function handleSaveStage() {
    const newStage = doc.getElementById('field-hire-stage').value;
    setPending(true, 'Starting onboarding Run…');
    api.saveStage(newStage).then((updated) => {
      hire = updated;
      setPending(false);
      renderAll();
      showToast('Onboarding Run started');
    }).catch(() => {
      setPending(false);
      renderAll();
      showToast('Could not start the onboarding Run — please try again');
    });
  }

  renderAll();
}

function createDefaultApi(hireId) {
  const patch = (changes) => fetch(`/hires/${hireId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  }).then((res) => res.json());

  return {
    saveStage: (hireStage) => patch({ hireStage }),
    updateRoleDepartment: (changes) => patch(changes),
    updateContact: (changes) => patch(changes),
    deactivate: () => fetch(`/hires/${hireId}/deactivate`, { method: 'POST' }).then((res) => res.json()),
    reactivate: () => fetch(`/hires/${hireId}/reactivate`, { method: 'POST' }).then((res) => res.json()),
  };
}

module.exports = { initHireProfileApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    fetch(`/hires/${DEMO_HIRE_ID}`)
      .then((res) => res.json())
      .then((hire) => initHireProfileApp(document, hire, createDefaultApi(DEMO_HIRE_ID)));
  });
}
