const MAX_ATTEMPTS = 3;
const BACKOFF_LABELS = ['30s', '2m'];
const FAILURE_REASON = 'Vendor API timeout (504) — Dell fulfillment gateway did not respond within 30s.';

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
    return `Manually resolved by ${escapeHtml(entry.resolver || '')}. Note: "${reason}". Run resumed from this task.`;
  }
  return reason;
}

function backoffStepClass(stepNum, attempts, state) {
  let cls = 'backoff-step';
  if (stepNum < attempts) cls += ' is-done';
  if (stepNum === attempts && state === 'retrying') cls += ' is-current';
  if (stepNum === 3 && state === 'blocked') cls += ' is-terminal';
  return cls;
}

function isFocusTask(task) {
  return task.state !== 'completed' && task.state !== 'pending';
}

function taskCardHtml(task, runId) {
  const focus = isFocusTask(task);
  let icon = '○';
  let chipClass = 'chip chip-pending';
  let chipLabel = '○ Queued';
  let cardClass = 'task-card card';
  let meta = '';
  let showReason = false;

  if (task.state === 'completed') {
    icon = '✓';
    chipClass = 'chip';
    chipLabel = '✓ Completed';
    meta = `Completed${task.completedAt ? ' ' + formatTimestamp(task.completedAt) : ''} · ${task.attempts} attempt${task.attempts === 1 ? '' : 's'}`;
  } else if (task.state === 'pending') {
    meta = 'Waiting on the previous task';
  } else if (task.state === 'in-progress') {
    icon = '▶';
    chipClass = 'chip chip-active';
    chipLabel = '▶ In progress';
    cardClass = 'task-card card is-active';
    meta = `Attempt ${task.attempts} of ${MAX_ATTEMPTS}`;
  } else if (task.state === 'retrying') {
    icon = '↻';
    chipClass = 'chip chip-active';
    chipLabel = '↻ Retrying';
    cardClass = 'task-card card is-active';
    meta = `Attempt ${task.attempts} of ${MAX_ATTEMPTS} · Next retry in ${BACKOFF_LABELS[task.attempts - 1] || ''} (exponential backoff)`;
    showReason = true;
  } else if (task.state === 'blocked') {
    icon = '⛔';
    chipClass = 'chip chip-blocked';
    chipLabel = '⛔ Blocked';
    cardClass = 'task-card card is-blocked';
    meta = `Attempt ${task.attempts} of ${MAX_ATTEMPTS} · Run ${runId} also moved to Blocked`;
    showReason = true;
  }

  const reasonHtml = showReason ? `<p class="task-reason">${escapeHtml(task.lastFailureReason)}</p>` : '';

  const backoffTrackHtml = focus
    ? `<div class="backoff-track" id="backoff-track" aria-label="Retry backoff schedule">
        <span class="${backoffStepClass(1, task.attempts, task.state)}" data-step="1">1st retry · 30s</span>
        <span class="backoff-arrow" aria-hidden="true">→</span>
        <span class="${backoffStepClass(2, task.attempts, task.state)}" data-step="2">2nd retry · 2m</span>
        <span class="backoff-arrow" aria-hidden="true">→</span>
        <span class="${backoffStepClass(3, task.attempts, task.state)}" data-step="3">3rd failure · blocked</span>
      </div>`
    : '';

  const bannerHtml = task.state === 'blocked'
    ? `<div class="banner" id="blocked-banner">
        <span class="banner-icon" aria-hidden="true">⛔</span>
        <div>
          <p><strong>Task blocked after 3 failed attempts.</strong> Human intervention required before this Run can continue.</p>
          <p style="margin-top:4px;">🔔 In-app alert sent to <strong>${escapeHtml(task.hrCoordinator ? task.hrCoordinator.name : '')}</strong> (HR Coordinator) · 📧 Email sent to <strong>${escapeHtml(task.hrCoordinator ? task.hrCoordinator.email : '')}</strong></p>
        </div>
      </div>`
    : '';

  const nextAttemptLabel = Math.min(task.attempts + 1, MAX_ATTEMPTS);
  const actionsHtml = focus
    ? `<div class="task-actions">
        <button class="btn btn-primary" id="simulate-btn" type="button"${task.state === 'blocked' ? ' hidden' : ''}>Simulate next outcome: attempt ${nextAttemptLabel} fails${nextAttemptLabel === MAX_ATTEMPTS ? ' (will block)' : ''}</button>
        <button class="btn btn-secondary" id="resolve-btn" type="button"${task.state === 'blocked' ? '' : ' hidden'}>Resolve blocked task</button>
      </div>`
    : '';

  return `
    <div class="${cardClass}"${focus ? ' id="focus-task-card"' : ''}>
      <div class="task-top">
        <p class="task-name"><span class="task-icon" aria-hidden="true">${icon}</span> ${escapeHtml(task.name)}</p>
        <span class="${chipClass}">${chipLabel}</span>
      </div>
      <p class="task-meta">${meta}</p>
      ${reasonHtml}
      ${backoffTrackHtml}
      ${bannerHtml}
      ${actionsHtml}
    </div>
  `;
}

function renderAuditLog(doc, entries) {
  const tbody = doc.getElementById('audit-tbody');
  if (!entries || entries.length === 0) {
    tbody.innerHTML = '<tr class="audit-empty"><td colspan="5">No retry or block events recorded yet for this Run.</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map((e) => `
    <tr>
      <td>${formatTimestamp(e.timestamp)}</td>
      <td>${escapeHtml(e.taskName)}</td>
      <td>${eventChip(e.event)}</td>
      <td class="col-attempt">${e.attempt} of ${e.maxAttempts}</td>
      <td>${auditDetail(e)}</td>
    </tr>
  `).join('');
}

function renderNotifications(doc, notifications) {
  const badge = doc.getElementById('notif-badge');
  const list = doc.getElementById('notif-list');
  const count = notifications.length;
  badge.hidden = count === 0;
  badge.textContent = String(count);
  if (count === 0) {
    list.innerHTML = '<p class="notif-empty" id="notif-empty">No alerts yet.</p>';
    return;
  }
  list.innerHTML = notifications.map((n) => `
    <div class="notif-item">
      <span aria-hidden="true">⛔</span>
      <div><p>${escapeHtml(n.text)}</p><time>${formatTimestamp(n.time)}</time></div>
    </div>
  `).join('');
}

function render(doc, state) {
  doc.getElementById('run-id').textContent = state.id;
  doc.getElementById('run-name').textContent = state.name;
  doc.getElementById('run-meta').textContent = `Started ${formatTimestamp(state.startedAt)} · ${state.tasks.length} tasks`;

  const runChip = doc.getElementById('run-status-chip');
  if (state.state === 'blocked') {
    runChip.className = 'chip chip-blocked';
    runChip.textContent = '⛔ Blocked';
  } else {
    runChip.className = 'chip chip-active';
    runChip.textContent = '▶ In progress';
  }

  doc.getElementById('task-list').innerHTML = state.tasks.map((t) => taskCardHtml(t, state.id)).join('');
  renderAuditLog(doc, state.auditLog);
  renderNotifications(doc, state.notifications);
}

let toastTimer = null;
function showToast(doc, icon, message) {
  const toast = doc.getElementById('toast');
  doc.getElementById('toast-icon').textContent = icon;
  doc.getElementById('toast-message').textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function initRunsPage(doc = document, runId = 'RUN-4821') {
  let state = await fetchJson(`/runs/${runId}`);
  render(doc, state);

  function getFocusTask() {
    return state.tasks.find(isFocusTask);
  }

  function attachTaskActionHandlers() {
    const simulateBtn = doc.getElementById('simulate-btn');
    if (simulateBtn) simulateBtn.addEventListener('click', handleSimulate);
    const resolveBtn = doc.getElementById('resolve-btn');
    if (resolveBtn) resolveBtn.addEventListener('click', openResolveModal);
  }

  async function handleSimulate() {
    const focusTask = getFocusTask();
    if (!focusTask) return;
    const btn = doc.getElementById('simulate-btn');
    btn.disabled = true;
    btn.textContent = 'Recording failure & evaluating retry policy…';
    try {
      const next = await fetchJson(`/runs/${runId}/tasks/${focusTask.id}/failures`, {
        method: 'POST',
        body: { reason: FAILURE_REASON },
      });
      state = next;
      render(doc, state);
      attachTaskActionHandlers();
      const updated = state.tasks.find((t) => t.id === focusTask.id);
      if (updated.state === 'blocked') {
        showToast(doc, '⛔', 'Blocked after 3 failures — HR coordinator notified (in-app + email)');
      } else {
        showToast(doc, '✓', `Retry scheduled — attempt ${updated.attempts} of ${MAX_ATTEMPTS}`);
      }
    } catch (err) {
      showToast(doc, '⚠', err.message);
      btn.disabled = false;
      btn.textContent = 'Simulate next outcome';
    }
  }

  function openResolveModal() {
    doc.getElementById('modal-overlay').hidden = false;
    doc.getElementById('modal-wrap').hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
    doc.getElementById('resolver-select').focus();
  }

  function closeModal() {
    doc.getElementById('modal-overlay').hidden = true;
    doc.getElementById('modal-wrap').hidden = true;
    doc.removeEventListener('keydown', onModalKeydown);
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }

  doc.getElementById('modal-close-btn').addEventListener('click', closeModal);
  doc.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  doc.getElementById('modal-overlay').addEventListener('click', closeModal);

  doc.getElementById('resolve-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const focusTask = getFocusTask();
    if (!focusTask) return;
    const resolver = doc.getElementById('resolver-select').value;
    const note = doc.getElementById('resolution-note').value.trim() || 'No additional note provided.';
    const resolveModalBtn = doc.getElementById('modal-resolve-btn');
    resolveModalBtn.disabled = true;
    resolveModalBtn.textContent = 'Resuming run…';
    try {
      const next = await fetchJson(`/runs/${runId}/tasks/${focusTask.id}/resolution`, {
        method: 'POST',
        body: { resolver, note },
      });
      state = next;
      render(doc, state);
      attachTaskActionHandlers();
      closeModal();
      showToast(doc, '✓', `Resolved by ${resolver} — Run resumed`);
    } catch (err) {
      showToast(doc, '⚠', err.message);
    } finally {
      resolveModalBtn.disabled = false;
      resolveModalBtn.textContent = 'Mark resolved & resume run';
    }
  });

  const notifBtn = doc.getElementById('notif-btn');
  const notifDropdown = doc.getElementById('notif-dropdown');
  notifBtn.addEventListener('click', () => {
    const open = notifDropdown.hidden;
    notifDropdown.hidden = !open;
    notifBtn.setAttribute('aria-expanded', String(open));
  });
  doc.addEventListener('click', (e) => {
    if (!notifDropdown.hidden && !e.target.closest('.notif-wrap')) {
      notifDropdown.hidden = true;
      notifBtn.setAttribute('aria-expanded', 'false');
    }
  });

  attachTaskActionHandlers();
}

module.exports = { initRunsPage };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initRunsPage());
}
