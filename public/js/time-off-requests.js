const { escapeHtml, formatDateDisplay } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

const HR_VIEWER = 'hrmanager';

const STATUS_CHIPS = {
  pending: '⏳ Pending',
  approved: '✓ Approved',
  cancelled: '✕ Cancelled',
};

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatRange(start, end) {
  return start === end ? formatDateDisplay(start) : `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
}

function initTimeOffRequestsApp(doc, api) {
  const $ = (id) => doc.getElementById(id);
  let employees = [];
  let types = [];
  let balances = null;
  let requests = [];
  let viewer = HR_VIEWER;
  let cancelTarget = null;
  let toastTimer = null;

  const isHr = () => viewer === HR_VIEWER;
  const typeName = (id) => (types.find((t) => t.id === id) || { name: id }).name;
  const employeeName = (id) => (employees.find((e) => e.id === id) || { name: id }).name;
  const balanceFor = (typeId) => (balances && typeof balances[typeId] === 'number' ? balances[typeId] : null);

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function showScreen(name) {
    $('list-screen').hidden = name !== 'list';
    $('form-screen').hidden = name !== 'form';
  }

  function renderHeader() {
    $('list-title').textContent = isHr() ? 'Time off requests — all employees' : 'My time off requests';
    $('list-subtitle').textContent = isHr()
      ? 'HR/Manager view: requests submitted by every employee.'
      : "Track requests you've submitted and cancel one if your plans change.";
    $('new-request-btn').hidden = isHr();
    $('balances-section').hidden = isHr();
  }

  function renderBalances() {
    const region = $('balance-region');
    if (isHr()) {
      region.innerHTML = '';
      return;
    }
    if (!balances) {
      region.innerHTML = '<div class="error-state card"><div class="icon" aria-hidden="true">⚠</div><p><strong>No balance information is available.</strong> The requests below are still accurate.</p></div>';
      return;
    }
    region.innerHTML = `<div class="balance-grid">${types.map((t) => `
      <div class="card balance-card">
        <p class="u-text-sm u-text-muted" style="margin:0 0 4px 0;">${escapeHtml(doc, t.name)}</p>
        <p class="balance-amount">${escapeHtml(doc, balances[t.id])} <small>days left</small></p>
      </div>`).join('')}</div>`;
  }

  function renderTable() {
    const region = $('table-region');
    const heading = $('table-heading');
    if (requests.length === 0) {
      heading.textContent = 'Requests';
      region.innerHTML = `<div class="card empty-state"><div class="icon" aria-hidden="true">🗓</div><p><strong>No time off requests yet.</strong> When time off is requested, it'll show up here with its status.</p>${isHr() ? '' : '<button type="button" class="btn btn-primary" data-new-request>Request time off</button>'}</div>`;
      const emptyBtn = region.querySelector('[data-new-request]');
      if (emptyBtn) emptyBtn.addEventListener('click', openForm); // eslint-disable-line no-use-before-define
      return;
    }
    heading.textContent = `Requests (${requests.length})`;
    region.innerHTML = `<div class="card" style="padding:0;overflow-x:auto;">
      <table class="requests-table">
        <thead><tr>
          ${isHr() ? '<th scope="col">Employee</th>' : ''}
          <th scope="col">Leave type</th>
          <th scope="col">Dates</th>
          <th scope="col">Days</th>
          <th scope="col">Status</th>
          <th scope="col"><span class="u-visually-hidden">Actions</span></th>
        </tr></thead>
        <tbody>${requests.map((r) => `<tr>
          ${isHr() ? `<td>${escapeHtml(doc, employeeName(r.employeeId))}</td>` : ''}
          <td>${escapeHtml(doc, r.leaveTypeName || typeName(r.leaveTypeId))}</td>
          <td>${formatRange(r.start, r.end)}</td>
          <td>${r.days}</td>
          <td><span class="status-chip status-chip--${r.status}">${STATUS_CHIPS[r.status]}</span></td>
          <td class="col-actions">${r.status === 'cancelled' ? '—' : `<button type="button" class="btn btn-secondary" data-cancel-id="${escapeHtml(doc, r.id)}">Cancel</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
    region.querySelectorAll('[data-cancel-id]').forEach((btn) => {
      btn.addEventListener('click', () => openCancelModal(btn.dataset.cancelId)); // eslint-disable-line no-use-before-define
    });
  }

  function renderError(retry) {
    $('table-region').innerHTML = '<div class="card error-state"><div class="icon" aria-hidden="true">⚠</div><p><strong>We couldn\'t load time off requests.</strong> Check your connection and try again.</p><button type="button" class="btn btn-primary" id="retry-btn">Retry</button></div>';
    $('retry-btn').addEventListener('click', retry);
  }

  function loadBalances() {
    if (isHr()) {
      balances = null;
      return Promise.resolve();
    }
    return Promise.resolve(api.getBalance(viewer)).then(
      (record) => { balances = record.balances; },
      () => { balances = null; },
    );
  }

  function loadView() {
    renderHeader();
    $('table-region').innerHTML = '<div class="skeleton skeleton-row"></div>';
    return Promise.all([loadBalances(), api.listRequests()]).then(([, list]) => {
      requests = list;
      renderBalances();
      renderTable();
    }, () => renderError(loadView));
  }

  // ---- cancel modal ----
  function closeCancelModal() {
    $('cancel-overlay').hidden = true;
    $('cancel-wrap').hidden = true;
    cancelTarget = null;
  }

  function openCancelModal(id) {
    const r = requests.find((x) => x.id === id);
    if (!r) return;
    cancelTarget = r;
    const name = escapeHtml(doc, r.leaveTypeName || typeName(r.leaveTypeId));
    $('cancel-sub').textContent = `${r.leaveTypeName || typeName(r.leaveTypeId)} · ${formatRange(r.start, r.end)} · ${plural(r.days, 'day')}`;
    if (r.status === 'pending') {
      $('cancel-consequence').innerHTML = `This request hasn't been approved yet, so cancelling it <strong>won't change</strong> the ${name} balance.`;
    } else {
      const restored = r.consumedDays || r.days;
      const current = balanceFor(r.leaveTypeId);
      const after = current === null || isHr() ? '' : ` (new balance: ${current + restored} days)`;
      $('cancel-consequence').innerHTML = `Cancelling this approved request will <strong>restore ${plural(restored, 'day')}</strong> to the ${name} balance${after}.`;
    }
    $('cancel-overlay').hidden = false;
    $('cancel-wrap').hidden = false;
    $('confirm-cancel-btn').focus();
  }

  $('cancel-close-btn').addEventListener('click', closeCancelModal);
  $('keep-request-btn').addEventListener('click', closeCancelModal);
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('cancel-wrap').hidden) closeCancelModal();
  });

  $('confirm-cancel-btn').addEventListener('click', () => {
    const target = cancelTarget;
    if (!target) return Promise.resolve();
    const btn = $('confirm-cancel-btn');
    const wasApproved = target.status === 'approved';
    const restored = target.consumedDays || target.days;
    btn.disabled = true;
    btn.textContent = 'Cancelling…';
    return Promise.resolve(api.cancelRequest(target.id)).then(() => {
      target.status = 'cancelled';
      target.consumedDays = 0;
      closeCancelModal();
      showToast(wasApproved
        ? `Request cancelled. ${plural(restored, 'day')} restored to the ${typeName(target.leaveTypeId)} balance.`
        : `Request cancelled. The ${typeName(target.leaveTypeId)} balance is unchanged.`);
      return wasApproved ? loadBalances() : undefined;
    }, (err) => {
      closeCancelModal();
      showToast((err && err.error) || "Couldn't cancel this request. Try again.");
    }).then(() => {
      renderBalances();
      renderTable();
    }).finally(() => {
      btn.disabled = false;
      btn.textContent = 'Cancel request';
    });
  });

  // ---- new request form ----
  const typeSelect = $('leavetype-select');
  const startInput = $('start-date');
  const endInput = $('end-date');
  const submitBtn = $('submit-btn');
  const validation = $('validation-region');

  const daysBetween = (s, e) => Math.round((Date.parse(e) - Date.parse(s)) / 86400000) + 1;

  function onFormChange() {
    const start = startInput.value;
    const end = endInput.value;
    const available = balanceFor(typeSelect.value);
    $('balance-hint').textContent = available === null ? '' : `Available balance: ${available} days`;
    validation.innerHTML = '';
    submitBtn.disabled = false;
    $('days-preview').textContent = '';
    if (!start || !end) return;
    if (end < start) {
      validation.innerHTML = '<div class="inline-error"><span aria-hidden="true">⚠</span><span>End date can\'t be before the start date.</span></div>';
      submitBtn.disabled = true;
      return;
    }
    $('days-preview').innerHTML = `<strong>${plural(daysBetween(start, end), 'day')}</strong> requested`;
  }

  function openForm() {
    typeSelect.innerHTML = types.map((t) => `<option value="${escapeHtml(doc, t.id)}">${escapeHtml(doc, t.name)}</option>`).join('');
    startInput.value = '';
    endInput.value = '';
    $('form-view').hidden = false;
    $('success-view').hidden = true;
    submitBtn.textContent = 'Submit request';
    onFormChange();
    showScreen('form');
  }

  function backToList() {
    showScreen('list');
    return loadView();
  }

  [typeSelect, startInput, endInput].forEach((el) => {
    el.addEventListener('change', onFormChange);
    el.addEventListener('input', onFormChange);
  });
  $('new-request-btn').addEventListener('click', openForm);
  $('back-link').addEventListener('click', backToList);
  $('success-back-btn').addEventListener('click', backToList);

  submitBtn.addEventListener('click', () => {
    const data = { leaveTypeId: typeSelect.value, start: startInput.value, end: endInput.value };
    if (!data.start || !data.end) {
      validation.innerHTML = '<div class="inline-error"><span aria-hidden="true">⚠</span><span>Enter a start and end date.</span></div>';
      return Promise.resolve();
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    return Promise.resolve(api.createRequest(viewer, data)).then((created) => {
      const days = (created && created.days) || daysBetween(data.start, data.end);
      $('success-detail').textContent = `${typeName(data.leaveTypeId)} · ${formatRange(data.start, data.end)} · ${plural(days, 'day')}`;
      $('form-view').hidden = true;
      $('success-view').hidden = false;
    }, (err) => {
      validation.innerHTML = `<div class="inline-error"><span aria-hidden="true">⚠</span><span>${escapeHtml(doc, (err && err.error) || "Couldn't submit this request. Try again.")}</span></div>`;
    }).finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit request';
    });
  });

  // ---- viewer + bootstrap ----
  const viewerSelect = $('viewer-select');
  viewerSelect.addEventListener('change', () => {
    viewer = viewerSelect.value;
    showScreen('list');
    return loadView();
  });

  function load() {
    return Promise.all([api.listEmployees(), api.listLeaveTypes()]).then(([emps, ts]) => {
      employees = emps;
      types = ts;
      viewerSelect.innerHTML = emps.map((e) => `<option value="${escapeHtml(doc, e.id)}">${escapeHtml(doc, e.name)}</option>`).join('')
        + `<option value="${HR_VIEWER}">HR / Manager</option>`;
      viewer = viewerSelect.value;
      return loadView();
    }, () => renderError(load));
  }

  return load();
}

function createTimeOffRequestsApi(getViewer) {
  function request(url, method, body, headers) {
    const options = { method, headers: { ...headers } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  function headersFor() {
    return getViewer() === HR_VIEWER ? { 'x-staff-role': 'hr' } : { 'x-employee-id': getViewer() };
  }

  return {
    // The picker needs the employee list before any viewer is chosen (same as leave-balances.js).
    listEmployees: () => request('/employees', 'GET', undefined, { 'x-staff-role': 'hr' }),
    listLeaveTypes: () => request('/leave/types', 'GET'),
    getBalance: (employeeId) => request(`/leave/balances/${encodeURIComponent(employeeId)}`, 'GET', undefined, { 'x-employee-id': employeeId }),
    listRequests: () => request('/leave/requests', 'GET', undefined, headersFor()),
    createRequest: (employeeId, data) => request('/leave/requests', 'POST', data, { 'x-employee-id': employeeId }),
    cancelRequest: (id) => request(`/leave/requests/${encodeURIComponent(id)}/cancel`, 'POST', undefined, headersFor()),
  };
}

if (typeof module !== 'undefined') module.exports = { initTimeOffRequestsApp, createTimeOffRequestsApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const viewerSelect = document.getElementById('viewer-select');
    initTimeOffRequestsApp(document, createTimeOffRequestsApi(() => viewerSelect.value));
  });
}
