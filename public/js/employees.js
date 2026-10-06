function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateDisplay(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}

function statusChipMarkup(status) {
  return status === 'deactivated'
    ? '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">⏸</span> Deactivated</span>'
    : '<span class="status-chip status-chip--active"><span aria-hidden="true">✓</span> Active</span>';
}

function isAccessDenied(err) {
  return Boolean(err && (err.status === 401 || err.status === 403));
}

function initEmployeesListApp(doc, initialEmployees, api, getRole = () => 'manager', onViewEmployee = () => {}) {
  let employees = initialEmployees.slice();
  let pending = null;
  let lastChangedId = null;
  let toastTimer = null;

  const $ = (id) => doc.getElementById(id);
  const tbody = $('directory-tbody');
  const statusFilter = $('status-filter');
  const roleBanner = $('role-banner');
  const roleSelect = $('role-select');
  const actionBtn = $('confirm-action-btn');

  function showToast(message) {
    $('toast-message').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }

  function renderBanner() {
    roleBanner.hidden = getRole() !== 'employee';
  }

  function renderList() {
    const filter = statusFilter.value;
    const visible = employees.filter((e) => filter === 'all' || e.employmentStatus === filter);
    if (visible.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>No employees match this filter.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = visible.map((e) => {
      const active = e.employmentStatus !== 'deactivated';
      const id = escapeHtml(e.id);
      return `<tr${e.id === lastChangedId ? ' class="row-changed"' : ''}>
        <td class="name-cell"><button type="button" class="person-name-link" data-view-id="${id}">${escapeHtml(e.name)}</button><span class="person-id">${id}</span></td>
        <td class="role-cell"><span class="role-line">${escapeHtml(e.role)}</span><br/><span class="dept-line">${escapeHtml(e.department)}</span></td>
        <td>${escapeHtml(formatDateDisplay(e.startDate))}</td>
        <td>${statusChipMarkup(e.employmentStatus)}</td>
        <td class="col-actions"><button type="button" class="action-link btn-sm" data-lifecycle-id="${id}">${active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`;
    }).join('');
    lastChangedId = null;
  }

  function closeConfirm() {
    $('confirm-overlay').hidden = true;
    $('confirm-wrap').hidden = true;
    pending = null;
  }

  function openConfirm(id) {
    const e = employees.find((x) => x.id === id);
    if (!e) return;
    const willDeactivate = e.employmentStatus !== 'deactivated';
    pending = { id, willDeactivate };
    $('confirm-title').textContent = willDeactivate ? 'Deactivate employee' : 'Reactivate employee';
    $('confirm-body').textContent = `${willDeactivate ? 'Deactivate' : 'Reactivate'} ${e.name}?`;
    $('confirm-consequence-text').innerHTML = willDeactivate
      ? `Marking <strong>${escapeHtml(e.name)}</strong> as deactivated takes effect immediately. Their record stays fully viewable to anyone who opens it — nothing is deleted.`
      : `Marking <strong>${escapeHtml(e.name)}</strong> as active takes effect immediately and is visible the moment this dialog closes.`;
    actionBtn.textContent = willDeactivate ? 'Deactivate employee' : 'Reactivate employee';
    actionBtn.disabled = false;
    $('confirm-overlay').hidden = false;
    $('confirm-wrap').hidden = false;
  }

  function confirmLifecycle() {
    if (!pending) return undefined;
    const { id, willDeactivate } = pending;
    actionBtn.disabled = true;
    actionBtn.textContent = 'Saving…';
    const request = willDeactivate ? api.deactivate(id) : api.reactivate(id);
    return Promise.resolve(request).then((saved) => {
      employees = employees.map((e) => (e.id === saved.id ? saved : e));
      lastChangedId = saved.id;
      closeConfirm();
      renderList();
      showToast(`${saved.name} ${willDeactivate ? 'deactivated' : 'reactivated'}`);
    }, (err) => {
      closeConfirm();
      showToast(isAccessDenied(err)
        ? 'Request rejected — HR or Manager role required. Status is unchanged.'
        : 'Status could not be changed — please try again');
    });
  }

  tbody.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-view-id]');
    if (viewBtn) return onViewEmployee(viewBtn.getAttribute('data-view-id'));
    const lifecycleBtn = e.target.closest('[data-lifecycle-id]');
    if (lifecycleBtn) openConfirm(lifecycleBtn.getAttribute('data-lifecycle-id'));
    return undefined;
  });
  statusFilter.addEventListener('change', renderList);
  if (roleSelect) roleSelect.addEventListener('change', renderBanner);
  $('confirm-close-btn').addEventListener('click', closeConfirm);
  $('confirm-cancel-btn').addEventListener('click', closeConfirm);
  $('confirm-overlay').addEventListener('click', closeConfirm);
  actionBtn.addEventListener('click', confirmLifecycle);

  renderBanner();
  renderList();
}

function createDefaultApi(getRole = () => 'manager') {
  function request(url, method) {
    return fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() } })
      .then((res) => res.json().catch(() => ({})).then((data) => (
        res.ok ? data : Promise.reject({ status: res.status, ...data })
      )));
  }

  return {
    list: () => request('/employees', 'GET'),
    deactivate: (id) => request(`/employees/${encodeURIComponent(id)}/deactivate`, 'POST'),
    reactivate: (id) => request(`/employees/${encodeURIComponent(id)}/reactivate`, 'POST'),
  };
}

if (typeof module !== 'undefined') module.exports = { initEmployeesListApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role-select');
    const getRole = () => roleSelect.value;
    const api = createDefaultApi(getRole);
    api.list().then((employees) => initEmployeesListApp(
      document,
      employees,
      api,
      getRole,
      (id) => { window.location.href = 'employee.html?employeeId=' + encodeURIComponent(id); },
    ));
  });
}
