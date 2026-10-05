function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatTimestamp(ts) {
  return String(ts || '').replace('T', ' ').slice(0, 16);
}

function initDeliveryLogApp(doc, attempts) {
  let expandedId = null;
  const body = doc.getElementById('log-body');
  const filterEl = doc.getElementById('status-filter');

  function rowMarkup(a) {
    const expanded = expandedId === a.id;
    const failed = a.status === 'failed';
    const row = `
      <tr>
        <td>${escapeHtml(formatTimestamp(a.createdAt))}</td>
        <td>${escapeHtml(a.recipientName)}<br><span class="u-text-sm u-text-muted">${escapeHtml(a.recipientRole)}</span></td>
        <td>${escapeHtml(a.channel)}</td>
        <td><span class="log-status ${failed ? 'failed' : ''}">${failed ? '⚠ Failed' : '✓ Delivered'}</span></td>
        <td><button class="log-toggle-btn" type="button" data-attempt-id="${escapeHtml(a.id)}" aria-expanded="${expanded}">${expanded ? 'Hide' : 'Details'}</button></td>
      </tr>`;
    if (!expanded) return row;
    return `${row}
      <tr class="log-detail-row"><td colspan="5">
        <div class="log-detail-box">
          <dl>
            <dt>Notification ID</dt><dd>${escapeHtml(a.notificationId)}</dd>
            <dt>Run / step</dt><dd>${escapeHtml(a.runId)} / ${escapeHtml(a.stepId)}</dd>
            <dt>Detail</dt><dd>${escapeHtml(a.detail)}</dd>
            ${a.errorCode ? `<dt>Error code</dt><dd>${escapeHtml(a.errorCode)}</dd>` : ''}
            <dt>Retry count</dt><dd>${escapeHtml(a.retryCount)}</dd>
          </dl>
        </div>
      </td></tr>`;
  }

  function render() {
    if (attempts.length === 0) {
      body.innerHTML = `
        <div class="card"><div class="empty-state">
          <p>Nothing logged yet.</p>
          <p class="u-text-sm u-text-muted" style="margin:0;">Every delivery attempt appears here once a run's step is blocked.</p>
        </div></div>`;
      return;
    }
    const filter = filterEl.value;
    const shown = attempts.filter((a) => filter === 'all' || a.status === filter);
    const delivered = attempts.filter((a) => a.status === 'delivered').length;
    const failed = attempts.filter((a) => a.status === 'failed').length;
    body.innerHTML = `
      <div class="log-stats">
        <span class="stat-chip">${attempts.length} attempts</span>
        <span class="stat-chip">${delivered} delivered</span>
        ${failed ? `<span class="stat-chip is-failed">⚠ ${failed} failed</span>` : '<span class="stat-chip">0 failed</span>'}
      </div>
      <div class="card">
        <div class="log-table-wrap">
          <table class="log-table">
            <thead><tr><th>Time</th><th>Recipient</th><th>Channel</th><th>Status</th><th></th></tr></thead>
            <tbody>${shown.map(rowMarkup).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  filterEl.addEventListener('change', render);
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.log-toggle-btn');
    if (!btn) return;
    expandedId = expandedId === btn.dataset.attemptId ? null : btn.dataset.attemptId;
    render();
  });

  render();
}

module.exports = { initDeliveryLogApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    fetch('/notifications/delivery-log')
      .then((res) => (res.ok ? res.json() : []))
      .then((attempts) => initDeliveryLogApp(document, attempts));
  });
}
