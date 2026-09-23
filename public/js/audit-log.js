function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatTimestamp(iso) {
  if (!iso) return '';
  return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC');
}

function formatBackoffMs(ms) {
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function eventChip(event) {
  if (event === 'blocked') return '<span class="chip chip-blocked" style="font-size:11px;">⛔ Blocked</span>';
  if (event === 'resolved') return '<span class="chip chip-active" style="font-size:11px;">✓ Resolved</span>';
  if (event === 'retry_scheduled') return '<span class="chip chip-active" style="font-size:11px;">↻ Retry scheduled</span>';
  return `<span class="chip" style="font-size:11px;">${escapeHtml(event)}</span>`;
}

function auditDetail(entry) {
  const reason = escapeHtml(entry.reason || '');
  if (entry.event === 'retry_scheduled') {
    return `${reason} Retry scheduled with backoff ${formatBackoffMs(entry.backoffMs)}. State → retrying.`;
  }
  if (entry.event === 'blocked') {
    return `${reason} Task and Run moved to Blocked. HR coordinator notified (in-app + email).`;
  }
  if (entry.event === 'resolved') {
    return `Manually resolved by ${escapeHtml(entry.resolver || '')}. Note: "${reason}". Run resumed.`;
  }
  return reason;
}

function render(doc, entries) {
  const tbody = doc.getElementById('audit-tbody');
  doc.getElementById('audit-note').textContent =
    `Showing ${entries.length} of ${entries.length} events · newest first · this log cannot be edited or deleted, by design.`;

  if (entries.length === 0) {
    tbody.innerHTML = '<tr class="audit-empty"><td colspan="5">No retry, block, or resolution events recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map((e) => `
    <tr>
      <td>${formatTimestamp(e.timestamp)}</td>
      <td>${escapeHtml(e.runId)} · ${escapeHtml(e.taskName)}</td>
      <td>${eventChip(e.event)}</td>
      <td class="col-attempt">${e.attempt} of ${e.maxAttempts}</td>
      <td>${auditDetail(e)}</td>
    </tr>
  `).join('');
}

async function initAuditLogPage(doc = document) {
  const res = await fetch('/audit-log');
  const entries = await res.json();
  render(doc, entries);
}

module.exports = { initAuditLogPage };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initAuditLogPage());
}
