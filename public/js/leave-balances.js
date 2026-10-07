const { escapeHtml } = require('./utils');

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initLeaveBalancesApp(doc, api) {
  let employees = [];
  let balancesById = {};
  let leaveTypes = [];
  let editingId = null;
  let lastChangedId = null;
  let toastTimer = null;
  let triggerElement = null;
  let triggerEmployeeId = null;

  const $ = (id) => doc.getElementById(id);
  const region = $('balances-region');
  const overlay = $('modal-overlay');
  const modalWrap = $('modal-wrap');
  const form = $('balances-form');
  const saveBtn = $('save-balances-btn');
  const errorBanner = $('modal-error-banner');

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function renderRow(emp) {
    const record = balancesById[emp.id];
    const chips = record
      ? leaveTypes.map((t) => `<span class="bal-chip"><span class="bal-label">${escapeHtml(doc, t.name)}</span> <span class="bal-amount">${escapeHtml(doc, record.balances[t.id])}</span></span>`).join('')
      : '<span class="muted-note">No starting balance yet</span>';
    const label = record ? 'Adjust balances' : 'Set starting balances';
    const btnClass = record ? 'btn-secondary' : 'btn-primary';
    const attr = record ? 'data-adjust-balances-id' : 'data-set-balances-id';
    return `<div class="emp-row${emp.id === lastChangedId ? ' flash' : ''}">
      <div class="emp-id-col">
        <div class="emp-name">${escapeHtml(doc, emp.name)}</div>
        <div class="emp-dept">${escapeHtml(doc, emp.jobTitle)}</div>
      </div>
      <div class="balances-col">${chips}</div>
      <div class="action-col"><button type="button" class="btn ${btnClass}" ${attr}="${escapeHtml(doc, emp.id)}">${label}</button></div>
    </div>`;
  }

  function renderList() {
    if (employees.length === 0) {
      region.innerHTML = '<div class="empty-state"><div class="icon" aria-hidden="true">🗂</div><h3>No employees yet</h3><p>Once an employee completes onboarding, they\'ll appear here for balance setup.</p></div>';
      return;
    }
    region.innerHTML = employees.map(renderRow).join('');
  }

  function renderLoading() {
    region.innerHTML = '<div class="muted-note" style="margin-bottom:var(--space-2);">Loading employees…</div>'
      + [1, 2, 3].map(() => '<div class="skeleton skeleton-row"></div>').join('');
  }

  function renderError() {
    region.innerHTML = '<div class="error-state" role="alert"><div class="icon" aria-hidden="true">⚠</div><h3>Couldn\'t load employee balances</h3><p>Something went wrong reaching the balances service. Your data is safe — try again.</p><button type="button" class="btn btn-primary" id="retry-btn">Try again</button></div>';
    $('retry-btn').addEventListener('click', load);
  }

  function load() {
    renderLoading();
    return Promise.all([api.listTypes(), api.listEmployees(), api.listBalances()]).then(([types, list, balanceRecords]) => {
      leaveTypes = types;
      employees = list;
      balancesById = {};
      balanceRecords.forEach((record) => { balancesById[record.employeeId] = record; });
      renderList();
    }).catch(renderError);
  }

  function setFieldError(id, invalid) {
    $(`error-${id}`).hidden = !invalid;
    $(`field-${id}`).setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function findTriggerButton(employeeId) {
    const buttons = region.querySelectorAll('[data-set-balances-id], [data-adjust-balances-id]');
    return Array.from(buttons).find((b) => (
      b.getAttribute('data-set-balances-id') || b.getAttribute('data-adjust-balances-id')
    ) === employeeId);
  }

  function restoreFocus() {
    const button = triggerEmployeeId ? findTriggerButton(triggerEmployeeId) : null;
    if (button) {
      button.focus();
    } else if (triggerElement && doc.contains(triggerElement)) {
      triggerElement.focus();
    }
    triggerElement = null;
    triggerEmployeeId = null;
  }

  function getFocusableElements() {
    return Array.from(modalWrap.querySelectorAll(FOCUSABLE_SELECTOR));
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
      restoreFocus();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && doc.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && doc.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openModal(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    triggerElement = doc.activeElement;
    triggerEmployeeId = employeeId;
    editingId = employeeId;
    const record = balancesById[employeeId];
    $('modal-title').textContent = `${record ? 'Adjust' : 'Set'} starting balances — ${emp.name}`;
    leaveTypes.forEach((t) => {
      $(`field-${t.id}`).value = record ? record.balances[t.id] : t.defaultBalance;
      setFieldError(t.id, false);
    });
    errorBanner.innerHTML = '';
    overlay.hidden = false;
    modalWrap.hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
    $('field-annual').focus();
  }

  function closeModal() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    saveBtn.disabled = false;
    editingId = null;
    doc.removeEventListener('keydown', onModalKeydown);
  }

  region.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-balances-id], [data-adjust-balances-id]');
    if (btn) openModal(btn.getAttribute('data-set-balances-id') || btn.getAttribute('data-adjust-balances-id'));
  });
  $('modal-close-btn').addEventListener('click', () => { closeModal(); restoreFocus(); });
  $('modal-cancel-btn').addEventListener('click', () => { closeModal(); restoreFocus(); });
  overlay.addEventListener('click', () => { closeModal(); restoreFocus(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    let invalid = false;
    let firstInvalidId = null;
    leaveTypes.forEach((t) => {
      const raw = $(`field-${t.id}`).value.trim();
      const num = Number(raw);
      const bad = raw === '' || Number.isNaN(num) || num < 0;
      setFieldError(t.id, bad);
      if (bad && !firstInvalidId) firstInvalidId = t.id;
      invalid = invalid || bad;
      values[t.id] = num;
    });
    if (invalid) {
      $(`field-${firstInvalidId}`).focus();
      return;
    }

    const emp = employees.find((x) => x.id === editingId);
    const wasSet = Boolean(balancesById[editingId]);
    saveBtn.disabled = true;
    errorBanner.innerHTML = '';
    return Promise.resolve(api.saveBalances(editingId, values)).then((record) => {
      balancesById[emp.id] = record;
      lastChangedId = emp.id;
      closeModal();
      renderList();
      restoreFocus();
      lastChangedId = null;
      showToast(record.created === false || wasSet ? `Starting balances updated for ${emp.name}.` : `Starting balances set for ${emp.name}.`);
    }, () => {
      saveBtn.disabled = false;
      errorBanner.innerHTML = '<div class="banner-error">Couldn\'t save — check your connection and try again. Your entries haven\'t been lost.</div>';
    });
  });

  return load();
}

function createLeaveBalancesApi(getRole) {
  function request(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  return {
    listEmployees: () => request('/employees', 'GET'),
    listTypes: () => request('/leave/types', 'GET'),
    listBalances: () => request('/leave/balances', 'GET'),
    saveBalances: (id, values) => request(`/leave/balances/${encodeURIComponent(id)}`, 'POST', values),
  };
}

if (typeof module !== 'undefined') module.exports = { initLeaveBalancesApp, createLeaveBalancesApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role-select');
    initLeaveBalancesApp(document, createLeaveBalancesApi(() => roleSelect.value));
  });
}
