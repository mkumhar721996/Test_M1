const { escapeHtml, formatDateDisplay, trapTab } = require('./utils');

function isAccessDenied(err) {
  return Boolean(err && (err.status === 401 || err.status === 403));
}

function initEmployeeProfileApp(doc, initialEmployee, api, getRole = () => 'manager') {
  let employee = { ...initialEmployee };
  let toastTimer = null;

  const $ = (id) => doc.getElementById(id);
  const lifecycleBtn = $('profile-lifecycle-btn');
  const actionBtn = $('confirm-action-btn');
  const roleSelect = $('role-select');
  const confirmWrap = $('confirm-wrap');
  const confirmPanel = confirmWrap.querySelector('.modal-panel');
  const confirmCancelBtn = $('confirm-cancel-btn');
  let confirmOpenerEl = null;

  function showToast(message, kind = 'status') {
    const toast = $('toast');
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    $('toast-message').textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove('is-visible'); }, 3500);
  }

  function onConfirmKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConfirm();
    } else if (e.key === 'Tab') {
      trapTab(doc, confirmPanel, e);
    }
  }

  function renderBanner() {
    $('profile-role-banner').hidden = getRole() !== 'employee';
  }

  function renderHistory() {
    const history = employee.history || [];
    $('profile-history').innerHTML = history.length === 0
      ? '<li class="history-item"><div class="history-body"><p class="history-meta">No manual status changes recorded.</p></div></li>'
      : history.map((h) => `
        <li class="history-item">
          <span class="history-dot" aria-hidden="true"></span>
          <div class="history-body">
            <p class="history-headline">${h.status === 'active' ? 'Reactivated — status set to Active' : 'Deactivated — status set to Deactivated'}</p>
            <p class="history-meta">${escapeHtml(doc, h.actor)} · ${escapeHtml(doc, formatDateDisplay(h.at.slice(0, 10)))}</p>
          </div>
        </li>`).join('');
  }

  function renderProfile() {
    const active = employee.employmentStatus !== 'deactivated';
    $('profile-name').textContent = employee.name || '—';
    $('profile-role-line').textContent = `${employee.role || '—'} · ${employee.department || '—'}`;
    $('profile-status-chip').innerHTML = active
      ? '<span class="status-chip status-chip--active"><span aria-hidden="true">✓</span> Active</span>'
      : '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">⏸</span> Deactivated</span>';
    lifecycleBtn.textContent = active ? 'Deactivate' : 'Reactivate';
    $('profile-id').textContent = employee.id;
    $('profile-email').textContent = employee.email || '—';
    $('profile-department').textContent = employee.department || '—';
    $('profile-role').textContent = employee.role || '—';
    $('profile-start-date').textContent = employee.startDate ? formatDateDisplay(employee.startDate) : '—';
    renderHistory();
  }

  function closeConfirm() {
    $('confirm-overlay').hidden = true;
    confirmWrap.hidden = true;
    doc.removeEventListener('keydown', onConfirmKeydown);
    if (confirmOpenerEl && typeof confirmOpenerEl.focus === 'function' && doc.contains(confirmOpenerEl)) {
      confirmOpenerEl.focus();
    }
    confirmOpenerEl = null;
  }

  function openConfirm() {
    const willDeactivate = employee.employmentStatus !== 'deactivated';
    confirmOpenerEl = doc.activeElement;
    $('confirm-title').textContent = willDeactivate ? 'Deactivate employee' : 'Reactivate employee';
    $('confirm-body').textContent = `${willDeactivate ? 'Deactivate' : 'Reactivate'} ${employee.name}?`;
    $('confirm-consequence-text').innerHTML = willDeactivate
      ? `Marking <strong>${escapeHtml(doc, employee.name)}</strong> as deactivated takes effect immediately. Their record stays fully viewable to anyone who opens it — nothing is deleted.`
      : `Marking <strong>${escapeHtml(doc, employee.name)}</strong> as active takes effect immediately and is visible the moment this dialog closes.`;
    actionBtn.textContent = willDeactivate ? 'Deactivate employee' : 'Reactivate employee';
    actionBtn.disabled = false;
    $('confirm-overlay').hidden = false;
    confirmWrap.hidden = false;
    doc.addEventListener('keydown', onConfirmKeydown);
    confirmCancelBtn.focus();
  }

  function confirmLifecycle() {
    const willDeactivate = employee.employmentStatus !== 'deactivated';
    actionBtn.disabled = true;
    actionBtn.textContent = 'Saving…';
    return Promise.resolve(willDeactivate ? api.deactivate() : api.reactivate()).then((saved) => {
      employee = saved;
      closeConfirm();
      renderProfile();
      showToast(`${saved.name} ${willDeactivate ? 'deactivated' : 'reactivated'}`);
    }, (err) => {
      closeConfirm();
      showToast(isAccessDenied(err)
        ? 'Request rejected — HR or Manager role required. Status is unchanged.'
        : 'Status could not be changed — please try again', 'error');
    });
  }

  lifecycleBtn.addEventListener('click', openConfirm);
  actionBtn.addEventListener('click', confirmLifecycle);
  $('confirm-close-btn').addEventListener('click', closeConfirm);
  $('confirm-cancel-btn').addEventListener('click', closeConfirm);
  $('confirm-overlay').addEventListener('click', closeConfirm);
  if (roleSelect) roleSelect.addEventListener('change', renderBanner);

  renderBanner();
  renderProfile();
}

function createDefaultApi(employeeId, getRole = () => 'manager') {
  function request(url, method) {
    return fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() } })
      .then((res) => res.json().catch(() => ({})).then((data) => (
        res.ok ? data : Promise.reject({ status: res.status, ...data })
      )));
  }

  const base = `/employees/${encodeURIComponent(employeeId)}`;
  return {
    deactivate: () => request(`${base}/deactivate`, 'POST'),
    reactivate: () => request(`${base}/reactivate`, 'POST'),
  };
}

function showEmployeeNotFound(doc) {
  doc.getElementById('profile-fieldset').hidden = true;
  doc.getElementById('profile-empty-state').hidden = false;
}

if (typeof module !== 'undefined') module.exports = { initEmployeeProfileApp, createDefaultApi, showEmployeeNotFound };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const employeeId = new URLSearchParams(window.location.search).get('employeeId');
    const roleSelect = document.getElementById('role-select');
    const getRole = () => roleSelect.value;
    document.getElementById('profile-back-btn').addEventListener('click', () => { window.location.href = 'employees.html'; });
    fetch(`/employees/${encodeURIComponent(employeeId)}`, { headers: { 'x-staff-role': getRole() } })
      .then((res) => (res.ok ? res.json() : null))
      .then((employee) => {
        if (!employee) return showEmployeeNotFound(document);
        return initEmployeeProfileApp(document, employee, createDefaultApi(employeeId, getRole), getRole);
      });
  });
}
