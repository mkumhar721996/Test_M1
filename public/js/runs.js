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

function initRunsListApp(doc, runs, onViewRun) {
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

module.exports = { initRunsListApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    fetch('/runs')
      .then((res) => res.json())
      .then((runs) => initRunsListApp(document, runs, (runId) => {
        window.location.href = `run-detail.html?runId=${encodeURIComponent(runId)}`;
      }));
  });
}
