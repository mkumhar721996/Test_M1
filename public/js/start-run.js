function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ALLOWED_ROLES = ['hr', 'manager'];
const PREVIEW_HINT = '<p class="u-text-sm u-text-muted">Select a hire and a workflow to preview its steps.</p>';

const DENIED_HTML = `
  <div class="card">
    <div class="access-denied" role="alert">
      <span class="icon" aria-hidden="true">⛔</span>
      <h2>Access denied</h2>
      <p>Onboarding runs are visible to HR and Manager accounts only. Your account doesn't have access to start a run.</p>
    </div>
  </div>`;

const EMPTY_HTML = `
  <div class="page-header"><div><h1>Start onboarding run</h1></div></div>
  <div class="card">
    <div class="empty-state">
      <p>Every current hire already has an onboarding run.</p>
      <p class="u-text-sm u-text-muted" style="margin:0;">New hires appear here as soon as their profile is created.</p>
    </div>
  </div>`;

// A hire is eligible when its profile is active and it has no active/blocked run.
function eligibleHires(hires, runs) {
  const busy = new Set(runs.filter((r) => r.status === 'active' || r.status === 'blocked').map((r) => r.hireId));
  return hires.filter((h) => h.profileStatus !== 'deactivated' && !busy.has(h.id));
}

function formHtml(hires, workflows) {
  return `
    <div class="page-header">
      <div>
        <h1>Start onboarding run</h1>
        <p>Select a hire and an existing workflow to begin tracking their onboarding.</p>
      </div>
    </div>
    <div class="card">
      <fieldset class="run-fieldset" id="start-run-fieldset">
        <div class="field">
          <label class="label" for="hire-select">Hire</label>
          <select class="input" id="hire-select">
            <option value="">Select a hire…</option>
            ${hires.map((h) => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)} — ${escapeHtml(h.role)}, ${escapeHtml(h.department)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="workflow-select">Workflow</label>
          <select class="input" id="workflow-select">
            <option value="">Select a workflow…</option>
            ${workflows.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <p class="label" style="margin-bottom: var(--space-2);">Workflow preview</p>
          <div id="workflow-preview">${PREVIEW_HINT}</div>
        </div>
        <div class="field-error" id="start-run-error" role="alert" hidden>
          <span aria-hidden="true">⚠</span>
          <span>Couldn't start the run. Nothing was created. Try again.</span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="button" id="start-run-submit-btn" disabled>Start run</button>
          <button class="btn btn-secondary" type="button" id="start-run-cancel-btn">Cancel</button>
        </div>
      </fieldset>
    </div>`;
}

function previewHtml(workflow) {
  return `
    <p class="u-text-sm u-text-muted" style="margin:0;">${workflow.steps.length} steps</p>
    <ol class="workflow-preview-list">
      ${workflow.steps.map((s, i) => `
        <li>${i + 1}. ${escapeHtml(s.name)} <span class="u-text-muted">(${escapeHtml(s.owner)})</span>
        ${s.requirementLabel ? `<span class="req">Blocking requirement: ${escapeHtml(s.requirementLabel)}</span>` : ''}
        </li>`).join('')}
    </ol>`;
}

function initStartRunApp(doc, data, api, onStarted, onCancel) {
  const body = doc.getElementById('start-run-screen-body');
  const roleSelect = doc.getElementById('role-select');
  const hires = eligibleHires(data.hires, data.runs || []);
  let pending = false;

  function renderForm() {
    if (hires.length === 0) {
      body.innerHTML = EMPTY_HTML;
      return;
    }
    body.innerHTML = formHtml(hires, data.workflows);
    const hireSelect = doc.getElementById('hire-select');
    const workflowSelect = doc.getElementById('workflow-select');
    const submitBtn = doc.getElementById('start-run-submit-btn');
    const errorEl = doc.getElementById('start-run-error');

    function update() {
      const wf = data.workflows.find((w) => w.id === workflowSelect.value);
      doc.getElementById('workflow-preview').innerHTML = wf ? previewHtml(wf) : PREVIEW_HINT;
      submitBtn.disabled = !(hireSelect.value && workflowSelect.value);
    }
    hireSelect.addEventListener('change', update);
    workflowSelect.addEventListener('change', update);
    doc.getElementById('start-run-cancel-btn').addEventListener('click', () => onCancel && onCancel());
    submitBtn.addEventListener('click', () => {
      if (pending || !hireSelect.value || !workflowSelect.value) return undefined;
      pending = true;
      doc.getElementById('start-run-fieldset').disabled = true;
      submitBtn.innerHTML = '<span class="spin" aria-hidden="true">⏳</span> Starting run…';
      errorEl.hidden = true;
      return Promise.resolve(api.startRun(workflowSelect.value, hireSelect.value)).then((run) => {
        if (onStarted) onStarted(run.id);
      }).catch(() => {
        pending = false;
        doc.getElementById('start-run-fieldset').disabled = false;
        submitBtn.textContent = 'Start run';
        errorEl.hidden = false;
      });
    });
  }

  function render() {
    if (!ALLOWED_ROLES.includes(roleSelect.value)) {
      body.innerHTML = DENIED_HTML;
      return;
    }
    renderForm();
  }

  roleSelect.addEventListener('change', render);
  render();
}

function createDefaultApi(getRole) {
  return {
    startRun: (workflowId, hireId) => fetch(`/workflows/${encodeURIComponent(workflowId)}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() },
      body: JSON.stringify({ hireId }),
    }).then((res) => {
      if (!res.ok) throw new Error(`request failed with status ${res.status}`);
      return res.json();
    }),
  };
}

module.exports = { initStartRunApp, eligibleHires };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const getRole = () => document.getElementById('role-select').value;
    const get = (url) => fetch(url, { headers: { 'x-staff-role': getRole() } })
      .then((res) => (res.ok ? res.json() : []));
    Promise.all([get('/hires'), get('/runs'), get('/workflows')]).then(([hires, runs, workflows]) => {
      initStartRunApp(document, { hires, runs, workflows }, createDefaultApi(getRole), (runId) => {
        window.location.href = `run-detail.html?runId=${encodeURIComponent(runId)}`;
      }, () => { window.location.href = 'runs.html'; });
    });
  });
}
