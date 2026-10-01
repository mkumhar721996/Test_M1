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

const ONBOARDING_STATUS_LABEL = { in_progress: 'In progress', completed: 'Completed ✓' };

const ERROR_MESSAGE = "Couldn't save — step progression failed. Run state unchanged. Try again.";

function formatTimestamp(ts) {
  return String(ts || '').replace('T', ' ').slice(0, 16);
}

function initRunDetailApp(doc, initialRun, api) {
  let run = initialRun;
  let auditOpen = false;
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

    if (step.status === 'blocked') {
      const met = step.requirementMet;
      const resolving = pendingAction === 'resolve';
      const retrying = pendingAction === 'advance';
      panel.innerHTML = `
        <div class="blocked-banner">
          <span aria-hidden="true">⚠</span>
          <div>
            <h3>This run is blocked</h3>
            <p>${escapeHtml(step.blockReason)}</p>
          </div>
        </div>
        <div class="requirement-row">
          <span class="label">${escapeHtml(step.requirementLabel)}</span>
          ${met
    ? '<span class="state--met">Received ✓</span>'
    : `<button class="btn btn-secondary btn-sm" type="button" id="resolve-btn">${resolving ? '<span class="spin" aria-hidden="true">⏳</span> Saving…' : 'Mark document received'}</button>`}
        </div>
        <div class="action-panel">
          <button class="btn btn-primary" type="button" id="retry-btn" ${met ? '' : 'disabled'}>
            ${retrying ? '<span class="spin" aria-hidden="true">⏳</span> Retrying step…' : 'Retry step'}
          </button>
          <p class="hint">Resolve the blocking condition above, then retry to resume this run from where it stopped.</p>
        </div>`;
      const resolveBtn = doc.getElementById('resolve-btn');
      if (resolveBtn) resolveBtn.addEventListener('click', () => runAction('resolve'));
      doc.getElementById('retry-btn').addEventListener('click', () => runAction('advance'));
      return;
    }

    const completing = pendingAction === 'advance';
    panel.innerHTML = `
      <p class="u-text-md" style="margin:0 0 var(--space-1) 0; color: var(--color-fg);">${escapeHtml(step.name)}</p>
      <p class="u-text-sm u-text-muted" style="margin:0;">${escapeHtml(step.description)}</p>
      <div class="action-panel">
        <button class="btn btn-primary" type="button" id="complete-btn" ${pendingAction ? 'disabled' : ''}>
          ${completing ? '<span class="spin" aria-hidden="true">⏳</span> Completing step…' : 'Mark step complete'}
        </button>
      </div>`;
    doc.getElementById('complete-btn').addEventListener('click', () => runAction('advance'));
  }

  function renderHireRecord() {
    const body = doc.getElementById('hire-record-body');
    const hire = run.hire;
    if (!hire) {
      body.innerHTML = '<p class="u-text-sm u-text-muted" style="margin:0;">No hire is linked to this run.</p>';
      return;
    }
    const statusLabel = ONBOARDING_STATUS_LABEL[hire.onboardingStatus] || hire.onboardingStatus || 'Not started';
    body.innerHTML = `
      <div class="kv-row"><span class="k">Name</span><span class="v">${escapeHtml(hire.name)}</span></div>
      <div class="kv-row"><span class="k">Role</span><span class="v">${escapeHtml(hire.role)}</span></div>
      <div class="kv-row"><span class="k">Department</span><span class="v">${escapeHtml(hire.department)}</span></div>
      <div class="kv-row"><span class="k">Onboarding status</span><span class="v">${escapeHtml(statusLabel)}</span></div>`;
  }

  function renderAuditLog() {
    const btn = doc.getElementById('audit-toggle-btn');
    btn.setAttribute('aria-expanded', String(auditOpen));
    btn.innerHTML = `Show entries (<span id="audit-count">${run.auditLog.length}</span>) ${auditOpen ? '▴' : '▾'}`;
    const list = doc.getElementById('audit-list');
    list.innerHTML = run.auditLog.slice().reverse().map((e) => `
      <li class="audit-item">
        <p class="meta">${escapeHtml(formatTimestamp(e.ts))} · ${escapeHtml(e.actor)}</p>
        <p class="msg">${escapeHtml(e.action)}</p>
      </li>`).join('');
    list.hidden = !auditOpen;
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
    renderHireRecord();
    renderAuditLog();
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

  doc.getElementById('audit-toggle-btn').addEventListener('click', () => {
    auditOpen = !auditOpen;
    renderAuditLog();
  });

  renderAll();
}

function createDefaultApi(runId) {
  const post = (action) => fetch(`/runs/${encodeURIComponent(runId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    fetch(`/runs/${encodeURIComponent(runId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((run) => {
        if (!run) return showRunNotFound(document);
        return initRunDetailApp(document, run, createDefaultApi(runId));
      });
  });
}
