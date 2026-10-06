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

function statusChipHtml(status) {
  const chip = STATUS_CHIP[status] || STATUS_CHIP.active;
  return `<span class="status-chip status-chip--${chip.cls}">${chip.markup}</span>`;
}

function formatStarted(startedAt) {
  return startedAt ? String(startedAt).slice(0, 10) : '';
}

const ALLOWED_ROLES = ['hr', 'manager'];

const DENIED_HTML = `
  <div class="card">
    <div class="access-denied" role="alert">
      <span class="icon" aria-hidden="true">⛔</span>
      <h2>Access denied</h2>
      <p>Onboarding runs are visible to HR and Manager accounts only. Your account doesn't have access to view or act on runs.</p>
    </div>
  </div>`;

const TABLE_HTML = `
  <div class="card">
    <div class="runs-table-wrap">
      <table class="runs-table">
        <thead>
          <tr>
            <th scope="col">New hire</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Current step</th>
            <th scope="col">Started</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody id="runs-tbody"></tbody>
      </table>
    </div>
  </div>`;

function initRunsListApp(doc, runs, onViewRun) {
  const body = doc.getElementById('runs-screen-body');
  const roleSelect = doc.getElementById('role-select');

  function renderRows() {
    const tbody = doc.getElementById('runs-tbody');
    if (runs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No onboarding runs yet.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.hireName)}</td>
      <td class="muted">${escapeHtml(run.role)} · ${escapeHtml(run.department)}</td>
      <td>${statusChipHtml(run.status)}</td>
      <td>${escapeHtml(run.currentStepLabel)}</td>
      <td class="muted">${escapeHtml(formatStarted(run.startedAt))}</td>
      <td><button class="btn btn-secondary btn-sm" type="button" data-view-run="${escapeHtml(run.id)}">View run</button></td>
    </tr>
  `).join('');
    tbody.querySelectorAll('[data-view-run]').forEach((btn) => {
      btn.addEventListener('click', () => onViewRun(btn.getAttribute('data-view-run')));
    });
  }

  function render() {
    if (!ALLOWED_ROLES.includes(roleSelect.value)) {
      body.innerHTML = DENIED_HTML;
      return;
    }
    body.innerHTML = TABLE_HTML;
    renderRows();
  }

  roleSelect.addEventListener('change', render);
  render();
}

module.exports = { initRunsListApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-run-btn').addEventListener('click', () => {
      window.location.href = 'start-run.html';
    });
    fetch('/runs', { headers: { 'x-staff-role': document.getElementById('role-select').value } })
      .then((res) => (res.ok ? res.json() : []))
      .then((runs) => initRunsListApp(document, runs, (runId) => {
        window.location.href = `run-detail.html?runId=${encodeURIComponent(runId)}`;
      }));
  });
}
