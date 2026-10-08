(function () {
  const { escapeHtml, formatDateDisplay, trapTab } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const STORAGE_KEY = 'expenses';
  const SORT_LABELS = { date: 'date', amount: 'amount', employeeName: 'employee', category: 'category' };
  const STATUS_LABELS = { submitted: 'Needs review', decided: 'Decided, not yet reimbursed', reimbursed: 'Reimbursed' };

  const INITIAL_QUEUE_EXPENSES = [
    { id: 'exp_201', employeeName: 'Morgan Ellis', category: 'Travel', amount: 412.75, date: '2026-09-15', description: 'Flight to Denver for client kickoff', status: 'submitted' },
    { id: 'exp_202', employeeName: 'Priya Shah', category: 'Meals', amount: 86.40, date: '2026-09-21', description: 'Team lunch after sprint demo', status: 'submitted' },
    { id: 'exp_203', employeeName: 'Devon Ruiz', category: 'Software', amount: 149.00, date: '2026-09-27', description: 'Annual seat renewal — design tool', status: 'submitted', categoryOverLimit: true, limitNote: 'Software spending this month is already at 134% of its configured $400 budget.' },
    { id: 'exp_204', employeeName: 'Jordan Lee', category: 'Other', amount: 220.00, date: '2026-10-05', description: 'Workshop registration: advanced facilitation', status: 'submitted' },
    { id: 'exp_205', employeeName: 'Morgan Ellis', category: 'Meals', amount: 58.20, date: '2026-09-10', description: 'Team dinner after client visit', status: 'rejected', decisions: [{ action: 'rejected', actor: 'Priya Shah', timestamp: '2026-09-11T10:02:00-05:00', note: 'Receipt includes a personal purchase mixed in with the team dinner — please resubmit with an itemized receipt for just the team portion.' }] },
    { id: 'exp_206', employeeName: 'Morgan Ellis', category: 'Meals', amount: 41.00, date: '2026-09-12', description: 'Team dinner after client visit (itemized receipt attached)', status: 'submitted', resubmissionOf: 'exp_205' },
    { id: 'exp_207', employeeName: 'Priya Shah', category: 'Travel', amount: 34.20, date: '2026-10-02', description: 'Taxi to airport for conference', status: 'approved', decisions: [{ action: 'approved', actor: 'Devon Ruiz', timestamp: '2026-10-02T15:40:00-05:00', note: '' }] },
    { id: 'exp_208', employeeName: 'Devon Ruiz', category: 'Office Supplies', amount: 42.99, date: '2026-09-30', description: 'Replacement laptop charger', status: 'approved', decisions: [{ action: 'approved', actor: 'Jordan Lee', timestamp: '2026-09-30T09:12:00-05:00', note: 'Within policy — approved.' }] },
    { id: 'exp_209', employeeName: 'Jordan Lee', category: 'Software', amount: 65.00, date: '2026-08-22', description: 'Monitoring tool upgrade', status: 'reimbursed', decisions: [{ action: 'approved', actor: 'Morgan Ellis', timestamp: '2026-08-23T11:00:00-05:00', note: '' }, { action: 'reimbursed', actor: 'Finance', timestamp: '2026-08-25T09:00:00-05:00', note: '' }] },
    { id: 'exp_210', employeeName: 'Priya Shah', category: 'Travel', amount: 175.00, date: '2026-10-06', description: 'Rideshare to client office', status: 'submitted' },
    { id: 'exp_211', employeeName: 'Devon Ruiz', category: 'Meals', amount: 128.50, date: '2026-09-28', description: 'Client dinner — Q3 renewal', status: 'approved', decisions: [{ action: 'approved', actor: 'Jordan Lee', timestamp: '2026-09-28T14:00:00-05:00', note: '' }] },
  ];

  function normalizeExpense(exp) {
    return {
      ...exp,
      employeeName: exp.employeeName || exp.loggedBy,
      status: exp.status || 'submitted',
      decisions: exp.decisions || [],
    };
  }

  function loadQueueExpenses() {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) list = JSON.parse(raw);
    } catch (e) { list = []; }
    const existingIds = new Set(list.map((e) => e.id));
    const seeded = INITIAL_QUEUE_EXPENSES.filter((e) => !existingIds.has(e.id));
    if (seeded.length) {
      list = [...list, ...seeded];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    }
    return list.map(normalizeExpense);
  }

  function persistQueueExpenses(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function filterQueue(list, { employee = '', category = '', status = '' } = {}) {
    return list.filter((exp) => {
      if (employee && exp.employeeName !== employee) return false;
      if (category && exp.category !== category) return false;
      if (status === 'submitted' && exp.status !== 'submitted') return false;
      if (status === 'decided' && !(exp.status === 'approved' || exp.status === 'rejected')) return false;
      if (status === 'reimbursed' && exp.status !== 'reimbursed') return false;
      return true;
    });
  }

  function sortQueue(list, field, dir = 'desc') {
    const mult = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      if (field === 'amount') return (a.amount - b.amount) * mult;
      return String(a[field]).localeCompare(String(b[field])) * mult;
    });
  }

  function isSelfSubmission(exp, viewerName) { return exp.employeeName === viewerName; }

  function lastDecision(exp) { return exp.decisions.length ? exp.decisions[exp.decisions.length - 1] : null; }

  function recordDecision(exp, action, actor, note) {
    exp.decisions.push({ action, actor, timestamp: new Date().toISOString(), note: note || '' });
    return exp;
  }

  function formatUSD(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function formatTimestamp(iso) {
    const dt = new Date(iso);
    return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      + ', ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function initApprovalsApp(doc = document) {
    const $ = (id) => doc.getElementById(id);
    const esc = (s) => escapeHtml(doc, s);
    let expenses = loadQueueExpenses();
    let filters = { employee: '', category: '', status: '' };
    let sortState = { field: 'date', dir: 'desc' };
    let demoView = 'normal';
    let modalState = { mode: null, expenseId: null, reverseTarget: 'submitted' };
    let lastFocusedEl = null;
    let loadTimer = null;
    let toastTimer = null;

    const viewerSelect = $('viewer-select');
    const tbody = $('queue-tbody');
    const overlay = $('modal-overlay');
    const wrap = $('modal-wrap');
    const modalTitle = $('modal-title');
    const modalSubtitle = $('modal-subtitle');
    const modalBody = $('modal-body');
    const confirmBtn = $('modal-confirm-btn');

    const currentApprover = () => viewerSelect.value;
    const findExpense = (id) => expenses.find((e) => e.id === id);

    function describeFilters() {
      const parts = [];
      if (filters.employee) parts.push(`Employee: ${filters.employee}`);
      if (filters.category) parts.push(`Category: ${filters.category}`);
      if (filters.status) parts.push(`Status: ${STATUS_LABELS[filters.status]}`);
      return parts;
    }

    function renderSummary(count) {
      const dirLabel = sortState.dir === 'asc' ? 'ascending' : 'descending';
      const base = describeFilters().length
        ? `Showing ${count} of ${expenses.length} expenses matching the applied filters`
        : `Showing all ${count} expense${count === 1 ? '' : 's'}`;
      $('result-summary').textContent = `${base}, sorted by ${SORT_LABELS[sortState.field]} (${dirLabel}).`;
    }

    function stateRow(html) {
      tbody.innerHTML = `<tr><td colspan="7">${html}</td></tr>`;
    }

    function renderSkeleton() {
      tbody.innerHTML = Array.from({ length: 4 }).map(() => `<tr class="skeleton-row">${Array.from({ length: 7 }).map(() => `<td><div class="skeleton-bar" style="width:${60 + Math.floor(Math.random() * 30)}%"></div></td>`).join('')}</tr>`).join('');
      $('result-summary').textContent = 'Loading the approval queue…';
    }

    function renderEmptyState() {
      stateRow(`
      <div class="empty-state">
        <span class="state-icon" aria-hidden="true">📭</span>
        <p class="state-title">No expenses need review right now</p>
        <p class="state-detail">New submissions from anyone on the team will show up here as soon as they're sent in.</p>
      </div>`);
      $('result-summary').textContent = 'Showing 0 expenses — the queue is empty.';
    }

    function renderErrorState() {
      stateRow(`
      <div class="error-state">
        <span class="state-icon" aria-hidden="true">⚠</span>
        <p class="state-title">Couldn't load the approval queue</p>
        <p class="state-detail">Check your connection and try again. No decisions were lost.</p>
        <button type="button" class="btn btn-secondary" id="retry-load-btn">Retry</button>
      </div>`);
      $('result-summary').textContent = 'The queue failed to load.';
      $('retry-load-btn').addEventListener('click', () => {
        $('demo-state-select').value = 'normal';
        demoView = 'normal';
        loadQueue();
      });
    }

    function renderNoMatch() {
      stateRow(`
      <div class="no-match-state">
        <span class="no-match-icon" aria-hidden="true">🔍</span>
        <p class="no-match-title">No expenses match these filters</p>
        <p class="no-match-detail">Try a different employee, category, or status, or clear the filters to see the full queue.</p>
      </div>`);
    }

    function rowActionsHtml(exp) {
      if (exp.status === 'reimbursed') return '<span class="dash-cell">—</span>';
      if (isSelfSubmission(exp, currentApprover())) {
        return '<span class="self-note"><span aria-hidden="true">🔒</span><span>Submitted by you — can\'t decide on your own expense</span></span>';
      }
      if (exp.status === 'submitted') {
        return `
        <div class="row-actions">
          <button type="button" class="btn btn-primary" data-action="approve" data-id="${esc(exp.id)}">Approve</button>
          <button type="button" class="btn btn-secondary" data-action="reject" data-id="${esc(exp.id)}">Reject</button>
        </div>`;
      }
      return `
      <div class="row-actions">
        <button type="button" class="btn btn-secondary" data-action="reverse" data-id="${esc(exp.id)}">Reverse decision</button>
      </div>`;
    }

    function statusCellHtml(exp) {
      const last = lastDecision(exp);
      if (exp.status === 'approved' && last) {
        return `
        <span class="status-chip is-approved">✓ Approved</span>
        <p class="decision-meta">Approved by ${esc(last.actor)} · ${formatTimestamp(last.timestamp)}</p>
        ${last.note ? `<p class="decision-note"><strong>Note:</strong> ${esc(last.note)}</p>` : ''}`;
      }
      if (exp.status === 'rejected' && last) {
        return `
        <span class="status-chip is-rejected">✕ Rejected</span>
        <p class="decision-meta">Rejected by ${esc(last.actor)} · ${formatTimestamp(last.timestamp)}</p>
        <p class="decision-note"><strong>Note:</strong> ${esc(last.note)}</p>`;
      }
      if (exp.status === 'reimbursed') {
        return '<span class="status-chip is-reimbursed">💰 Reimbursed</span><p class="decision-meta">Paid out — no further action.</p>';
      }
      return '<span class="status-chip">Submitted</span>';
    }

    function descCellHtml(exp) {
      let html = '';
      if (exp.resubmissionOf) html += '<div class="resubmission-tag"><span aria-hidden="true">↻</span><span>Resubmission</span></div>';
      html += `<div>${esc(exp.description)}</div>`;
      const original = exp.resubmissionOf && findExpense(exp.resubmissionOf);
      const d = original && lastDecision(original);
      if (d) {
        html += `<div class="resubmission-context">Previous attempt rejected by ${esc(d.actor)} on ${formatDateDisplay(d.timestamp.slice(0, 10))}: "${esc(d.note)}"</div>`;
      }
      return html;
    }

    function rowHtml(exp) {
      const isSelf = isSelfSubmission(exp, currentApprover());
      return `
        <td class="employee-cell">${esc(exp.employeeName)}${isSelf ? ' <span class="self-tag">(you)</span>' : ''}</td>
        <td>${formatDateDisplay(exp.date)}</td>
        <td>
          <span class="chip">${esc(exp.category)}</span>
          ${exp.categoryOverLimit ? `<div class="limit-note"><span aria-hidden="true">ℹ</span><span>${esc(exp.limitNote)}</span></div>` : ''}
        </td>
        <td class="col-amount">${formatUSD(exp.amount)}</td>
        <td class="desc-cell">${descCellHtml(exp)}</td>
        <td>${statusCellHtml(exp)}</td>
        <td class="row-actions-cell">${rowActionsHtml(exp)}</td>`;
    }

    function renderQueue() {
      const list = sortQueue(filterQueue(expenses, filters), sortState.field, sortState.dir);
      if (list.length === 0) {
        renderNoMatch();
      } else {
        tbody.innerHTML = '';
        list.forEach((exp) => {
          const tr = doc.createElement('tr');
          tr.dataset.rowId = exp.id;
          if (exp.status === 'reimbursed') tr.classList.add('is-reimbursed');
          tr.innerHTML = rowHtml(exp);
          tbody.appendChild(tr);
        });
      }
      renderSummary(list.length);
    }

    function loadQueue() {
      renderSkeleton();
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        if (demoView === 'empty') renderEmptyState();
        else if (demoView === 'error') renderErrorState();
        else renderQueue();
      }, 320);
    }

    function refreshQueue() {
      if (demoView !== 'normal') { loadQueue(); return; }
      renderQueue();
    }

    function showToast(message) {
      const toast = $('toast');
      toast.textContent = message;
      toast.hidden = false;
      toast.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
    }

    // ---------- Decision modal ----------
    function clearNoteError() {
      const err = $('decision-note-error');
      const field = $('decision-note');
      if (err) err.hidden = true;
      if (field) field.classList.remove('input-invalid');
    }

    function openModal(mode, expenseId) {
      const exp = findExpense(expenseId);
      if (!exp || isSelfSubmission(exp, currentApprover()) || exp.status === 'reimbursed') return;
      modalState = { mode, expenseId, reverseTarget: 'submitted' };
      lastFocusedEl = doc.activeElement;
      modalSubtitle.textContent = `${exp.employeeName} · ${exp.category} · ${formatUSD(exp.amount)} · ${formatDateDisplay(exp.date)}`;

      if (mode === 'approve') {
        modalTitle.textContent = 'Approve expense';
        confirmBtn.textContent = 'Approve expense';
        modalBody.innerHTML = `
        <div class="field">
          <label class="label" for="decision-note">Note to the employee (optional)</label>
          <textarea class="input" id="decision-note" placeholder="e.g. Approved — within policy."></textarea>
        </div>`;
      } else if (mode === 'reject') {
        modalTitle.textContent = 'Reject expense';
        confirmBtn.textContent = 'Reject expense';
        modalBody.innerHTML = `
        <div class="field">
          <label class="label" for="decision-note">Note to the employee (required)</label>
          <textarea class="input" id="decision-note" placeholder="Explain what needs to change so they can resubmit."></textarea>
          <p class="field-error" id="decision-note-error" hidden>⚠ Add a note explaining why this expense is rejected before you can reject it.</p>
        </div>`;
      } else {
        modalTitle.textContent = 'Reverse decision';
        confirmBtn.textContent = 'Confirm reversal';
        const last = lastDecision(exp);
        const currentlyApproved = exp.status === 'approved';
        modalBody.innerHTML = `
        <div class="outcome-summary">
          <dl>
            <dt>Currently</dt><dd>${currentlyApproved ? 'Approved' : 'Rejected'}${last ? ` by ${esc(last.actor)} · ${formatTimestamp(last.timestamp)}` : ''}</dd>
          </dl>
        </div>
        <div class="field" style="margin-bottom: var(--space-2);">
          <label class="radio-option">
            <input type="radio" name="reverse-target" value="submitted" checked />
            <span><span class="radio-label">Return to submitted</span><span class="radio-help">Back in the queue for any approver to decide again.</span></span>
          </label>
          ${currentlyApproved ? `
          <label class="radio-option">
            <input type="radio" name="reverse-target" value="rejected" />
            <span><span class="radio-label">Reject instead</span><span class="radio-help">Requires a note — carries the same consequence as a primary rejection.</span></span>
          </label>` : ''}
        </div>
        <div class="field" id="reverse-note-field">
          <label class="label" for="decision-note">Note to the employee (optional)</label>
          <textarea class="input" id="decision-note" placeholder="Explain the reversal, if helpful."></textarea>
          <p class="field-error" id="decision-note-error" hidden>⚠ Add a note explaining the rejection before you can confirm.</p>
        </div>
        <p class="consequence-note" id="reverse-consequence" hidden>
          <span class="hint-icon" aria-hidden="true">ℹ</span>
          <span>Reversing to "Rejected" notifies the employee the same way a direct rejection would.</span>
        </p>`;
        wrap.querySelectorAll('input[name="reverse-target"]').forEach((radio) => {
          const onSelect = () => {
            if (!radio.checked) return;
            modalState.reverseTarget = radio.value;
            const toRejected = radio.value === 'rejected';
            $('reverse-note-field').querySelector('.label').textContent = `Note to the employee (${toRejected ? 'required' : 'optional'})`;
            $('reverse-consequence').hidden = !toRejected;
            clearNoteError();
          };
          radio.addEventListener('change', onSelect);
          radio.addEventListener('click', onSelect);
        });
      }

      overlay.hidden = false;
      wrap.hidden = false;
      const noteField = $('decision-note');
      noteField.focus();
      noteField.addEventListener('input', clearNoteError);
    }

    function closeModal() {
      overlay.hidden = true;
      wrap.hidden = true;
      modalState = { mode: null, expenseId: null, reverseTarget: 'submitted' };
      if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
    }

    function applyDecision(exp, actor, note) {
      const { mode, reverseTarget } = modalState;
      if (mode === 'approve') {
        exp.status = 'approved';
        recordDecision(exp, 'approved', actor, note);
        showToast(`Approved ${exp.employeeName}'s ${exp.category.toLowerCase()} expense.`);
      } else if (mode === 'reject') {
        exp.status = 'rejected';
        recordDecision(exp, 'rejected', actor, note);
        showToast(`Rejected ${exp.employeeName}'s ${exp.category.toLowerCase()} expense.`);
      } else if (reverseTarget === 'submitted') {
        exp.status = 'submitted';
        recordDecision(exp, 'reversed_to_submitted', actor, note);
        showToast('Decision reversed — back in the queue as submitted.');
      } else {
        exp.status = 'rejected';
        recordDecision(exp, 'reversed_to_rejected', actor, note);
        showToast('Decision reversed to rejected — the employee is notified, same as a direct rejection.');
      }
    }

    confirmBtn.addEventListener('click', () => {
      const exp = findExpense(modalState.expenseId);
      if (!exp || confirmBtn.disabled) return;
      const actor = currentApprover();
      if (isSelfSubmission(exp, actor)) { closeModal(); return; }
      const noteField = $('decision-note');
      const note = noteField.value.trim();
      const noteRequired = modalState.mode === 'reject'
        || (modalState.mode === 'reverse' && modalState.reverseTarget === 'rejected');
      if (noteRequired && !note) {
        $('decision-note-error').hidden = false;
        noteField.classList.add('input-invalid');
        noteField.focus();
        return;
      }

      confirmBtn.disabled = true;
      const originalLabel = confirmBtn.textContent;
      confirmBtn.textContent = 'Saving…';
      setTimeout(() => {
        applyDecision(exp, actor, note);
        persistQueueExpenses(expenses);
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalLabel;
        closeModal();
        refreshQueue();
      }, 300);
    });

    // ---------- Wiring ----------
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) openModal(btn.dataset.action, btn.dataset.id);
    });
    viewerSelect.addEventListener('change', refreshQueue);
    $('filter-employee').addEventListener('change', (e) => { filters.employee = e.target.value; refreshQueue(); });
    $('filter-category').addEventListener('change', (e) => { filters.category = e.target.value; refreshQueue(); });
    $('filter-status').addEventListener('change', (e) => { filters.status = e.target.value; refreshQueue(); });
    $('sort-field').addEventListener('change', (e) => { sortState.field = e.target.value; refreshQueue(); });
    $('sort-direction-btn').addEventListener('click', (e) => {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      e.target.textContent = sortState.dir === 'asc' ? '▲' : '▼';
      refreshQueue();
    });
    $('demo-state-select').addEventListener('change', (e) => {
      demoView = e.target.value;
      loadQueue();
    });
    $('modal-close-btn').addEventListener('click', closeModal);
    $('modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    doc.addEventListener('keydown', (e) => {
      if (wrap.hidden) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'Tab') trapTab(doc, wrap.querySelector('.modal-panel'), e);
    });

    $('sort-direction-btn').textContent = '▼';
    renderQueue();
  }

  const approvalsExports = {
    STORAGE_KEY,
    INITIAL_QUEUE_EXPENSES,
    normalizeExpense,
    loadQueueExpenses,
    persistQueueExpenses,
    filterQueue,
    sortQueue,
    isSelfSubmission,
    lastDecision,
    recordDecision,
    initApprovalsApp,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = approvalsExports;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => initApprovalsApp());
  }
}());
