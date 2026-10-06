function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_CHIP = {
  active: { cls: 'active', markup: '<span class="dot" aria-hidden="true">●</span> Active' },
  blocked: { cls: 'blocked', markup: '<span aria-hidden="true">⚠</span> Blocked' },
  completed: { cls: 'completed', markup: '<span aria-hidden="true">✓</span> Completed' },
};

const STEP_DISPLAY = {
  done: { icon: '✓', label: 'Completed' },
  current: { icon: '●', label: 'Current step' },
  blocked: { icon: '⚠', label: 'Blocked' },
  upcoming: { icon: '○', label: 'Upcoming' },
};

const ALLOWED_ROLES = ['hr', 'manager'];

const ERROR_MESSAGE = "Couldn't save — step progression failed. Run state unchanged. Try again.";

function formatDate(ts) {
  return String(ts || '').slice(0, 10);
}

function formatTimestamp(ts) {
  return String(ts || '').replace('T', ' ').slice(0, 16);
}

function initRunDetailApp(doc, initialRun, api) {
  let run = initialRun;
  let pendingAction = null;
  let toastTimer = null;

  const fieldset = doc.getElementById('run-fieldset');
  const toast = doc.getElementById('error-toast');

  function renderHeader() {
    const hire = run.hire;
    doc.getElementById('run-heading').textContent = hire ? `Run — ${hire.name}` : 'Run';
    doc.getElementById('run-subheading').textContent = hire ? `${hire.department} — ${hire.role} ·` : '';
    doc.getElementById('run-id-label').textContent = run.id;
    const chip = STATUS_CHIP[run.status] || STATUS_CHIP.active;
    const chipEl = doc.getElementById('run-status-chip');
    chipEl.className = `status-chip status-chip--${chip.cls}`;
    chipEl.innerHTML = chip.markup;
  }

  function renderProgress() {
    const total = run.steps.length;
    const done = run.steps.filter((s) => s.status === 'done').length;
    doc.getElementById('progress-label').textContent = `${done} of ${total} steps complete`;
    doc.getElementById('progress-fill').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  }

  function renderStepper() {
    doc.getElementById('stepper').innerHTML = run.steps.map((step) => {
      const display = STEP_DISPLAY[step.status] || STEP_DISPLAY.upcoming;
      const statusCls = STEP_DISPLAY[step.status] ? step.status : 'upcoming';
      return `
      <li class="step-item step-item--${statusCls}">
        <span class="step-marker" aria-hidden="true">${display.icon}</span>
        <p class="step-name">${escapeHtml(step.name)}</p>
        <p class="step-owner">${escapeHtml(step.owner || '')}${step.owner ? ' · ' : ''}${display.label}</p>
        ${statusCls === 'blocked' ? '<p class="step-tag"><span aria-hidden="true">⚠</span> Blocked — not skipped, waiting on manager</p>' : ''}
      </li>`;
    }).join('');
  }

  function renderActionPanel() {
    const panel = doc.getElementById('action-panel');
    const step = run.steps[run.currentIndex];

    if (run.status === 'completed') {
      const who = run.hire ? ` for ${escapeHtml(run.hire.name)}` : '';
      panel.innerHTML = `
        <div class="success-panel">
          <h3>All ${run.steps.length} steps complete</h3>
          <p>Onboarding finished${who}. No further action needed.</p>
        </div>`;
      return;
    }

    const hasRequirement = Boolean(step.requirementLabel);
    const met = step.requirementMet;
    const showError = step.status === 'blocked' && hasRequirement && !met;
    const resolving = pendingAction === 'resolve';
    const advancing = pendingAction === 'advance';
    panel.innerHTML = `
      <p class="u-text-md" style="margin:0 0 var(--space-1) 0; color: var(--color-fg);">${escapeHtml(step.name)}</p>
      <p class="u-text-sm u-text-muted" style="margin:0;">${escapeHtml(step.description)}</p>
      ${hasRequirement ? `
        <div class="requirement-row">
          <span class="label">${escapeHtml(step.requirementLabel)}</span>
          ${met
    ? '<span class="state--met">Met ✓</span>'
    : `<button class="btn btn-secondary btn-sm" type="button" id="resolve-btn">${resolving ? '<span class="spin" aria-hidden="true">⏳</span> Resolving…' : 'Mark requirement met'}</button>`}
        </div>` : ''}
      <div class="action-panel">
        <button class="btn btn-primary" type="button" id="advance-btn" ${pendingAction ? 'disabled' : ''}>
          ${advancing ? '<span class="spin" aria-hidden="true">⏳</span> Advancing…' : 'Advance step'}
        </button>
        <div class="field-error" id="field-error" role="alert" ${showError ? '' : 'hidden'}>
          <span aria-hidden="true">⚠</span>
          <span>Can't advance — "${escapeHtml(step.requirementLabel || '')}" has not been met yet. Mark it met to continue.</span>
        </div>
      </div>`;
    const resolveBtn = doc.getElementById('resolve-btn');
    if (resolveBtn) resolveBtn.addEventListener('click', () => runAction('resolve'));
    doc.getElementById('advance-btn').addEventListener('click', () => runAction('advance'));
  }

  function renderSummary() {
    doc.getElementById('run-summary-body').innerHTML = `
      <div class="run-meta-row"><span class="k">Workflow</span><span class="v">${escapeHtml(run.workflowName)}</span></div>
      <div class="run-meta-row"><span class="k">Started</span><span class="v">${escapeHtml(formatDate(run.startedAt))}</span></div>`;
  }

  function renderActivity() {
    doc.getElementById('activity-list').innerHTML = run.auditLog.slice().reverse().map((e) => `
      <li class="activity-item">
        <p class="meta">${escapeHtml(formatTimestamp(e.ts))} · ${escapeHtml(e.actor)}</p>
        <p class="msg">${escapeHtml(e.action)}</p>
      </li>`).join('');
  }

  function renderPending() {
    fieldset.disabled = Boolean(pendingAction);
    let note = doc.getElementById('pending-note');
    if (pendingAction && !note) {
      note = doc.createElement('div');
      note.id = 'pending-note';
      note.className = 'pending-note';
      note.innerHTML = '<span class="spin" aria-hidden="true">⏳</span> Saving run state — no other action can be started until this finishes.';
      fieldset.appendChild(note);
    } else if (!pendingAction && note) {
      note.remove();
    }
  }

  function renderAll() {
    renderHeader();
    renderProgress();
    renderStepper();
    renderActionPanel();
    renderSummary();
    renderActivity();
    renderPending();
  }

  function showErrorToast() {
    doc.getElementById('error-toast-message').textContent = ERROR_MESSAGE;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function runAction(actionId) {
    if (pendingAction) return;
    pendingAction = actionId;
    renderActionPanel();
    renderPending();

    const request = actionId === 'resolve' ? api.resolveRequirement() : api.advanceStep();
    return Promise.resolve(request).then((updated) => {
      run = updated;
      pendingAction = null;
      renderAll();
    }).catch(() => {
      pendingAction = null;
      renderActionPanel();
      renderPending();
      showErrorToast();
    });
  }

  const roleSelect = doc.getElementById('role-select');
  function applyRole() {
    const allowed = ALLOWED_ROLES.includes(roleSelect.value);
    fieldset.hidden = !allowed;
    doc.getElementById('run-denied-panel').hidden = allowed;
    doc.getElementById('run-status-chip').hidden = !allowed;
  }
  roleSelect.addEventListener('change', applyRole);

  renderAll();
  applyRole();
}

function createDefaultApi(runId, getRole) {
  const post = (action) => fetch(`/runs/${encodeURIComponent(runId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() },
    body: JSON.stringify({}),
  }).then((res) => {
    if (!res.ok) throw new Error(`request failed with status ${res.status}`);
    return res.json();
  });

  return {
    advanceStep: () => post('advance'),
    resolveRequirement: () => post('resolve-requirement'),
  };
}

function showRunNotFound(doc) {
  doc.getElementById('run-fieldset').hidden = true;
  doc.getElementById('run-status-chip').hidden = true;
  doc.getElementById('run-empty-state').hidden = false;
}

module.exports = { initRunDetailApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const runId = new URLSearchParams(window.location.search).get('runId');
    const getRole = () => document.getElementById('role-select').value;
    fetch(`/runs/${encodeURIComponent(runId)}`, { headers: { 'x-staff-role': getRole() } })
      .then((res) => (res.ok ? res.json() : null))
      .then((run) => {
        if (!run) return showRunNotFound(document);
        return initRunDetailApp(document, run, createDefaultApi(runId, getRole));
      });
  });
}
