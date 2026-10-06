const { escapeHtml, formatDateDisplay } = require('./utils');

const ALLOWED_ROLES = ['hr', 'manager'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_DISPLAY = {
  active: { label: 'Active', className: 'status-chip--active' },
  deactivated: { label: 'Deactivated', className: 'status-chip--deactivated' },
  on_leave: { label: 'On leave', className: 'status-chip--leave' },
  terminated: { label: 'Terminated', className: 'status-chip--terminated' },
};

function isAccessDenied(err) {
  return Boolean(err && (err.status === 401 || err.status === 403));
}

function initEmployeeProfileApp(doc, employeeId, api, getRole) {
  let employee = null;
  let viewDenied = false;
  let toastTimer = null;

  const profileArea = doc.getElementById('profile-area');
  const roleBanner = doc.getElementById('role-banner');
  const overlay = doc.getElementById('modal-overlay');
  const modalWrap = doc.getElementById('modal-wrap');
  const modalSubtitle = doc.getElementById('modal-subtitle');
  const formDenyNotice = doc.getElementById('form-deny-notice');
  const saveErrorBanner = doc.getElementById('save-error-banner');
  const form = doc.getElementById('profile-form');
  const saveBtn = doc.getElementById('modal-save-btn');
  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');

  const fieldEmployeeId = doc.getElementById('field-employee-id');
  const fieldName = doc.getElementById('field-name');
  const fieldEmail = doc.getElementById('field-email');
  const fieldDepartment = doc.getElementById('field-department');
  const fieldRole = doc.getElementById('field-role');
  const fieldStartDate = doc.getElementById('field-start-date');
  const fieldEmploymentStatus = doc.getElementById('field-employment-status');

  const hasAccess = () => ALLOWED_ROLES.includes(getRole());

  function showToast(message) {
    toastMessage.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function renderEmptyState() {
    profileArea.innerHTML = `
      <div class="empty-state">
        <span class="state-icon" aria-hidden="true">👤</span>
        <p>Select an employee to see their profile.</p>
      </div>`;
  }

  function renderDeniedState() {
    profileArea.innerHTML = `
      <div class="notice--deny">
        <span class="notice-icon" aria-hidden="true">⛔</span>
        <div>
          <p><strong>You don't have permission to view this profile.</strong></p>
          <p class="notice-sub">Viewing employee profiles is restricted to HR and Manager roles. No profile data was returned.</p>
        </div>
      </div>
      <div style="margin-top: var(--space-4); text-align:right;">
        <button type="button" class="btn btn-secondary locked-btn" id="edit-profile-btn"><span class="lock-icon" aria-hidden="true">🔒</span>Edit profile</button>
      </div>`;
    doc.getElementById('edit-profile-btn').addEventListener('click', onEditClick);
  }

  function renderSkeleton() {
    profileArea.innerHTML = `
      <div class="profile-card-header">
        <div class="skeleton-line skeleton-label" style="width:40%; height:1.5em; margin-bottom:0;"></div>
      </div>
      <div class="kv-grid">
        ${Array.from({ length: 6 }).map(() => `
          <div class="kv-item">
            <div class="skeleton-line skeleton-label"></div>
            <div class="skeleton-line skeleton-value"></div>
          </div>`).join('')}
      </div>`;
  }

  function renderErrorState() {
    profileArea.innerHTML = `
      <div class="error-state">
        <span class="state-icon" aria-hidden="true">⚠</span>
        <p><strong>Couldn't load this profile.</strong><br/>Something went wrong fetching this employee's record.</p>
        <button type="button" class="btn btn-primary" id="retry-load-btn">Retry</button>
      </div>`;
    doc.getElementById('retry-load-btn').addEventListener('click', loadProfile);
  }

  function renderProfile(emp, changedKeys = []) {
    const fieldCell = (key, label, value) => {
      const empty = value === '' || value === undefined || value === null;
      const cls = `kv-item${changedKeys.includes(key) ? ' field-changed' : ''}`;
      const valueCls = `kv-value${empty ? ' is-not-set' : ''}`;
      return `<div class="${cls}"><span class="kv-label">${label}</span><span class="${valueCls}">${empty ? 'Not set' : escapeHtml(doc, value)}</span></div>`;
    };
    const status = STATUS_DISPLAY[emp.employmentStatus] || { label: emp.employmentStatus, className: 'status-chip--terminated' };
    profileArea.innerHTML = `
      <div class="profile-card-header">
        <h2 class="card-title" style="margin:0;">${escapeHtml(doc, emp.name)}</h2>
        <button type="button" class="btn btn-primary" id="edit-profile-btn">Edit profile</button>
      </div>
      <div class="profile-id-line"><span class="lock-icon" aria-hidden="true">🔒</span><span>Employee ID: ${escapeHtml(doc, emp.id)} (locked)</span></div>
      <div class="kv-grid" style="margin-top: var(--space-4);">
        ${fieldCell('name', 'Full name', emp.name)}
        ${fieldCell('email', 'Email', emp.email)}
        ${fieldCell('department', 'Department', emp.department)}
        ${fieldCell('role', 'Role', emp.role)}
        ${fieldCell('startDate', 'Start date', emp.startDate ? formatDateDisplay(emp.startDate) : '')}
        <div class="kv-item${changedKeys.includes('employmentStatus') ? ' field-changed' : ''}"><span class="kv-label">Employment status</span><span class="kv-value"><span class="status-chip ${status.className}">${escapeHtml(doc, status.label)}</span></span></div>
      </div>
      ${emp.department ? '' : '<p class="partial-note"><span class="hint-icon" aria-hidden="true">ℹ</span><span>Department was never captured for this employee during onboarding. Use "Edit profile" to fill it in.</span></p>'}
    `;
    doc.getElementById('edit-profile-btn').addEventListener('click', onEditClick);
  }

  function loadProfile() {
    roleBanner.hidden = hasAccess();
    employee = null;
    viewDenied = false;
    if (!employeeId) {
      renderEmptyState();
      return;
    }
    renderSkeleton();
    api.getProfile().then((emp) => {
      employee = emp;
      renderProfile(emp);
    }, (err) => {
      if (isAccessDenied(err)) {
        viewDenied = true;
        renderDeniedState();
      } else {
        renderErrorState();
      }
    });
  }

  // ---------- Edit modal ----------
  function openModalShell() {
    overlay.hidden = false;
    modalWrap.hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
  }

  function closeModal() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
    doc.removeEventListener('keydown', onModalKeydown);
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelForm();
    }
  }

  function cancelForm() {
    const wasDenied = !formDenyNotice.hidden;
    closeModal();
    if (!wasDenied) showToast('No changes saved — dialog closed');
  }

  function setFieldError(fieldEl, errorId, message) {
    const errorEl = doc.getElementById(errorId);
    errorEl.hidden = !message;
    if (message) errorEl.textContent = `⚠ ${message}`;
    fieldEl.classList.toggle('input-invalid', Boolean(message));
    fieldEl.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearAllErrors() {
    setFieldError(fieldName, 'error-name', '');
    setFieldError(fieldEmail, 'error-email', '');
    setFieldError(fieldDepartment, 'error-department', '');
    setFieldError(fieldRole, 'error-role', '');
    setFieldError(fieldStartDate, 'error-start-date', '');
  }

  function ensureDepartmentOption(department) {
    if (!department) return;
    const known = Array.from(fieldDepartment.options).some((o) => o.value === department);
    if (known) return;
    const option = doc.createElement('option');
    option.value = department;
    option.textContent = department;
    fieldDepartment.appendChild(option);
  }

  function ensureStatusOption(status) {
    if (!status) return;
    const known = Array.from(fieldEmploymentStatus.options).some((o) => o.value === status);
    if (known) return;
    const option = doc.createElement('option');
    option.value = status;
    option.textContent = (STATUS_DISPLAY[status] || {}).label || status;
    fieldEmploymentStatus.appendChild(option);
  }

  function onEditClick() {
    saveErrorBanner.hidden = true;
    if (viewDenied || !hasAccess()) {
      // AC4: form never renders, so no update request can be made.
      form.hidden = true;
      formDenyNotice.hidden = false;
      modalSubtitle.textContent = employeeId ? `Profile ${employeeId}.` : '';
      openModalShell();
      return;
    }
    if (!employee) return;
    form.hidden = false;
    formDenyNotice.hidden = true;
    clearAllErrors();
    ensureDepartmentOption(employee.department);
    fieldEmployeeId.value = employee.id;
    fieldName.value = employee.name || '';
    fieldEmail.value = employee.email || '';
    fieldDepartment.value = employee.department || '';
    fieldRole.value = employee.role || '';
    fieldStartDate.value = employee.startDate || '';
    ensureStatusOption(employee.employmentStatus);
    fieldEmploymentStatus.value = employee.employmentStatus;
    modalSubtitle.textContent = `Profile ${employee.id}. Update any field and save. Employment status is changed from the Employee Directory, not here.`;
    openModalShell();
    fieldName.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    clearAllErrors();
    saveErrorBanner.hidden = true;

    const changes = {
      name: fieldName.value.trim(),
      email: fieldEmail.value.trim(),
      department: fieldDepartment.value,
      role: fieldRole.value.trim(),
      startDate: fieldStartDate.value,
    };
    const errors = {
      name: changes.name === '' ? 'Full name is required.' : '',
      email: changes.email === '' ? 'Email is required.' : (!EMAIL_PATTERN.test(changes.email) ? 'Enter a valid email address.' : ''),
      department: changes.department === '' ? 'Department is required.' : '',
      role: changes.role === '' ? 'Role is required.' : '',
      startDate: changes.startDate === '' ? 'Start date is required.' : '',
    };
    setFieldError(fieldName, 'error-name', errors.name);
    setFieldError(fieldEmail, 'error-email', errors.email);
    setFieldError(fieldDepartment, 'error-department', errors.department);
    setFieldError(fieldRole, 'error-role', errors.role);
    setFieldError(fieldStartDate, 'error-start-date', errors.startDate);
    const firstInvalid = [[errors.name, fieldName], [errors.email, fieldEmail], [errors.department, fieldDepartment], [errors.role, fieldRole], [errors.startDate, fieldStartDate]]
      .find(([message]) => message);
    if (firstInvalid) {
      firstInvalid[1].focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    // The locked employee id is never part of the payload (AC5).
    api.updateProfile(changes).then((updated) => {
      const changedKeys = Object.keys(changes).filter((key) => employee[key] !== updated[key]);
      employee = updated;
      closeModal();
      renderProfile(updated, changedKeys);
      showToast('Profile updated');
    }, () => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
      saveErrorBanner.hidden = false;
    });
  }

  doc.getElementById('modal-close-btn').addEventListener('click', cancelForm);
  doc.getElementById('modal-cancel-btn').addEventListener('click', cancelForm);
  overlay.addEventListener('click', cancelForm);
  form.addEventListener('submit', onSubmit);

  loadProfile();
  return { reload: loadProfile };
}

function createDefaultApi(employeeId, getRole) {
  function request(url, method, body) {
    const opts = { method, headers: { 'x-staff-role': getRole() } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  return {
    getProfile: () => request(`/employees/${employeeId}`, 'GET'),
    updateProfile: (changes) => request(`/employees/${employeeId}`, 'PATCH', changes),
  };
}

module.exports = { initEmployeeProfileApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role-select');
    const getRole = () => roleSelect.value;
    const employeeId = new URLSearchParams(window.location.search).get('id');
    const app = initEmployeeProfileApp(document, employeeId, createDefaultApi(employeeId, getRole), getRole);
    roleSelect.addEventListener('change', app.reload);
  });
}
