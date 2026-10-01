const { escapeHtml } = require('./utils');

const ALL_ROLES = ['admin', 'finance', 'employee'];
const ROLE_LABELS = { admin: 'Admin', finance: 'Finance', employee: 'Employee' };
const ROLE_DESCRIPTIONS = {
  admin: 'Full access, including creating and managing user accounts.',
  finance: 'Approves expenses and manages financial records.',
  employee: 'Logs and views their own expenses.',
};

const TOAST_MS = 3200;

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function roleChipHtml(role) {
  const cls = role === 'admin' ? 'chip role-chip role-chip--admin' : 'chip role-chip';
  return `<span class="${cls}">${ROLE_LABELS[role]}</span>`;
}

function statusChipHtml(status) {
  if (status === 'active') return '<span class="status-chip status-chip--active"><span aria-hidden="true">●</span> Active</span>';
  return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">◌</span> Deactivated</span>';
}

function initUsersApp(doc, initialUsers, api, viewer) {
  let users = initialUsers.slice();
  let editingUserId = null;
  let deactivatingUserId = null;

  const viewerName = doc.getElementById('viewer-name');
  const signinLink = doc.getElementById('um-signin-link');
  const tempPasswordNote = doc.getElementById('um-temp-password');
  const tempPasswordValue = doc.getElementById('um-temp-password-value');
  const accessDenied = doc.getElementById('um-access-denied');
  const accessDeniedCopy = doc.getElementById('um-access-denied-copy');
  const loadError = doc.getElementById('um-error');
  const content = doc.getElementById('um-content');
  const tableWrap = doc.getElementById('um-table-wrap');
  const emptyState = doc.getElementById('um-empty');
  const tbody = doc.getElementById('user-tbody');
  const resultsCount = doc.getElementById('um-results-count');
  const searchInput = doc.getElementById('user-search-input');
  const toastRoot = doc.getElementById('toast-root');

  const modalOverlay = doc.getElementById('user-modal-overlay');
  const modalWrap = doc.getElementById('user-modal-wrap');
  const userForm = doc.getElementById('user-form');
  const nameField = doc.getElementById('name-field');
  const emailField = doc.getElementById('email-field');
  const nameInput = doc.getElementById('user-name-input');
  const emailInput = doc.getElementById('user-email-input');
  const nameError = doc.getElementById('name-error');
  const emailError = doc.getElementById('email-error');
  const roleChecklist = doc.getElementById('role-checklist');
  const rolesError = doc.getElementById('roles-error');
  const saveBtn = doc.getElementById('user-modal-save-btn');

  const deactivateOverlay = doc.getElementById('deactivate-modal-overlay');
  const deactivateWrap = doc.getElementById('deactivate-modal-wrap');
  const deactivateBody = doc.getElementById('deactivate-modal-body');

  function findUser(id) {
    return users.find((u) => u.id === id) || null;
  }

  function replaceUser(updated) {
    users = users.map((u) => (u.id === updated.id ? updated : u));
  }

  function showToast(message) {
    const el = doc.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span aria-hidden="true">✓</span><span>${escapeHtml(doc, message)}</span>`;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), TOAST_MS);
  }

  function showTemporaryPassword(password) {
    tempPasswordValue.textContent = password;
    tempPasswordNote.hidden = false;
  }

  function hideTemporaryPassword() {
    tempPasswordValue.textContent = '';
    tempPasswordNote.hidden = true;
  }

  function renderLoading() {
    tableWrap.hidden = false;
    emptyState.hidden = true;
    resultsCount.textContent = 'Loading user accounts…';
    const row = '<tr class="skeleton-row"><td><div class="skeleton-bar"></div></td><td><div class="skeleton-bar short"></div></td><td><div class="skeleton-bar short"></div></td><td><div class="skeleton-bar short"></div></td><td></td></tr>';
    tbody.innerHTML = row.repeat(3);
  }

  function renderTable() {
    const query = searchInput.value;
    const term = query.trim().toLowerCase();
    const list = users.filter((u) => !term
      || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));

    if (list.length === 0 && term) {
      tableWrap.hidden = true;
      emptyState.hidden = false;
      emptyState.querySelector('.empty-query').textContent = query;
      resultsCount.textContent = `Showing 0 accounts for "${query}".`;
      return;
    }

    tableWrap.hidden = false;
    emptyState.hidden = true;
    if (term) {
      resultsCount.textContent = `Showing ${list.length} ${list.length === 1 ? 'account' : 'accounts'} for "${query}".`;
    } else {
      const activeCount = users.filter((u) => u.status === 'active').length;
      resultsCount.textContent = `Showing ${users.length} accounts — ${activeCount} active.`;
    }

    tbody.innerHTML = list.map((u) => {
      const isActive = u.status === 'active';
      const toggleLabel = isActive ? 'Deactivate' : 'Reactivate';
      const toggleCls = isActive ? 'row-action-btn danger-text' : 'row-action-btn';
      return '<tr>' +
        `<td class="user-name-cell">${escapeHtml(doc, u.name)}<span class="user-email">${escapeHtml(doc, u.email)}</span></td>` +
        `<td><div class="role-chips">${u.roles.map(roleChipHtml).join('')}</div></td>` +
        `<td>${statusChipHtml(u.status)}</td>` +
        `<td>${formatDateTime(u.lastActive)}</td>` +
        '<td class="col-actions">' +
          `<button type="button" class="row-action-btn" data-action="edit" data-id="${u.id}">Edit roles</button>` +
          `<button type="button" class="${toggleCls}" data-action="toggle-status" data-id="${u.id}">${toggleLabel}</button>` +
        '</td>' +
        '</tr>';
    }).join('');
  }

  function reload() {
    accessDenied.hidden = true;
    loadError.hidden = true;
    content.hidden = false;
    renderLoading();
    return api.list().then((data) => {
      users = data;
      renderTable();
    }).catch((err) => {
      const status = err && err.status;
      if (status === 401 || status === 403) {
        content.hidden = true;
        accessDenied.hidden = false;
        signinLink.hidden = status !== 401;
        if (err.body && err.body.message) accessDeniedCopy.textContent = err.body.message;
        return;
      }
      content.hidden = true;
      loadError.hidden = false;
    });
  }

  viewerName.textContent = viewer ? viewer.name : 'Not signed in';
  doc.getElementById('um-retry-btn').addEventListener('click', reload);
  searchInput.addEventListener('input', renderTable);
  doc.getElementById('um-temp-password-dismiss').addEventListener('click', hideTemporaryPassword);
  doc.getElementById('um-clear-search-btn').addEventListener('click', () => {
    searchInput.value = '';
    renderTable();
  });

  /* ---------------- Modals ---------------- */
  function openModal(overlay, wrap, focusEl) {
    overlay.hidden = false;
    wrap.hidden = false;
    if (focusEl) focusEl.focus();
  }
  function closeModal(overlay, wrap) {
    overlay.hidden = true;
    wrap.hidden = true;
  }
  function closeUserModal() { closeModal(modalOverlay, modalWrap); }
  function closeDeactivateModal() { closeModal(deactivateOverlay, deactivateWrap); }

  function clearFormErrors() {
    [nameError, emailError, rolesError].forEach((el) => { el.hidden = true; });
  }

  function showFieldError(el, message) {
    el.textContent = `⚠ ${message}`;
    el.hidden = false;
  }

  function renderRoleChecklist(checkedRoles) {
    roleChecklist.innerHTML = ALL_ROLES.map((role) => {
      const checked = checkedRoles.includes(role) ? ' checked' : '';
      return '<label class="role-option">' +
        `<input type="checkbox" value="${role}"${checked} />` +
        `<span class="role-option-text"><strong>${ROLE_LABELS[role]}</strong><span>${ROLE_DESCRIPTIONS[role]}</span></span>` +
        '</label>';
    }).join('');
  }

  function checkedRoles() {
    return Array.from(roleChecklist.querySelectorAll('input:checked')).map((input) => input.value);
  }

  function openCreateModal() {
    editingUserId = null;
    doc.getElementById('user-modal-title').textContent = 'New user';
    doc.getElementById('user-modal-subtitle').textContent = 'Create an account and assign at least one role.';
    saveBtn.textContent = 'Create account';
    nameField.hidden = false;
    emailField.hidden = false;
    nameInput.value = '';
    emailInput.value = '';
    clearFormErrors();
    renderRoleChecklist([]);
    openModal(modalOverlay, modalWrap, nameInput);
  }

  function openEditModal(id) {
    const user = findUser(id);
    if (!user) return;
    editingUserId = id;
    doc.getElementById('user-modal-title').textContent = 'Edit roles';
    doc.getElementById('user-modal-subtitle').textContent = `Update ${user.name}’s roles. Changes apply on their next action — no new account needed.`;
    saveBtn.textContent = 'Save changes';
    nameField.hidden = true;
    emailField.hidden = true;
    clearFormErrors();
    renderRoleChecklist(user.roles);
    openModal(modalOverlay, modalWrap, roleChecklist.querySelector('input'));
  }

  function openDeactivateModal(id) {
    const user = findUser(id);
    if (!user) return;
    deactivatingUserId = id;
    deactivateBody.textContent = `Deactivate ${user.name}’s account? They will no longer be able to sign in. Expenses they created or approved will remain visible as read-only history tied to their account.`;
    openModal(deactivateOverlay, deactivateWrap, doc.getElementById('deactivate-cancel-btn'));
  }

  doc.getElementById('new-user-btn').addEventListener('click', openCreateModal);
  doc.getElementById('user-modal-close-btn').addEventListener('click', closeUserModal);
  doc.getElementById('user-modal-cancel-btn').addEventListener('click', closeUserModal);
  modalOverlay.addEventListener('click', closeUserModal);
  doc.getElementById('deactivate-modal-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);
  roleChecklist.addEventListener('change', () => { rolesError.hidden = true; });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalWrap.hidden) closeUserModal();
    if (!deactivateWrap.hidden) closeDeactivateModal();
  });

  function applyServerError(err, fallbackMessage) {
    if (err && (err.status === 401 || err.status === 403)) {
      closeUserModal();
      closeDeactivateModal();
      reload();
      return;
    }
    const fields = (err && err.body && err.body.fields) || {};
    if (fields.name) showFieldError(nameError, fields.name);
    if (fields.email) showFieldError(emailError, fields.email);
    if (fields.roles) showFieldError(rolesError, fields.roles);
    if (!fields.name && !fields.email && !fields.roles) showToast(fallbackMessage);
  }

  userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors();
    const roles = checkedRoles();
    if (roles.length === 0) {
      rolesError.hidden = false;
      const first = roleChecklist.querySelector('input');
      if (first) first.focus();
      return;
    }

    if (editingUserId) {
      const user = findUser(editingUserId);
      api.setRoles(editingUserId, roles).then((updated) => {
        replaceUser(updated);
        closeUserModal();
        renderTable();
        showToast(`Roles updated for ${user.name} — changes apply on their next action.`);
      }).catch((err) => applyServerError(err, 'Roles could not be saved — please try again.'));
      return;
    }

    const name = nameInput.value.trim();
    api.create({ name, email: emailInput.value.trim(), roles }).then(({ temporaryPassword, ...created }) => {
      users.unshift(created);
      showTemporaryPassword(temporaryPassword);
      closeUserModal();
      renderTable();
      showToast(`Account created — ${created.name} can now sign in.`);
    }).catch((err) => applyServerError(err, 'Account could not be created — please try again.'));
  });

  doc.getElementById('deactivate-confirm-btn').addEventListener('click', () => {
    const user = findUser(deactivatingUserId);
    if (!user) return;
    api.deactivate(user.id).then((updated) => {
      replaceUser(updated);
      closeDeactivateModal();
      renderTable();
      showToast(`${user.name}’s account is deactivated. Their expense history stays visible as read-only.`);
    }).catch((err) => applyServerError(err, 'Deactivation could not be completed — please try again.'));
  });

  tbody.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const id = button.getAttribute('data-id');
    const actionId = button.getAttribute('data-action');
    if (actionId === 'edit') {
      openEditModal(id);
    } else if (actionId === 'toggle-status') {
      const user = findUser(id);
      if (!user) return;
      if (user.status === 'active') {
        openDeactivateModal(id);
      } else {
        api.reactivate(id).then((updated) => {
          replaceUser(updated);
            renderTable();
          showToast(`${user.name}’s account is active again — they can sign in.`);
        }).catch((err) => applyServerError(err, 'Reactivation could not be completed — please try again.'));
      }
    }
  });

  renderTable();

  return { reload };
}

function createDefaultApi(getToken) {
  function request(url, method, body) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then((res) => res.json().then((json) => {
      if (!res.ok) return Promise.reject({ status: res.status, body: json });
      return json;
    }));
  }

  return {
    list: () => request('/users', 'GET'),
    create: (data) => request('/users', 'POST', data),
    setRoles: (id, roles) => request(`/users/${id}/roles`, 'PATCH', { roles }),
    deactivate: (id) => request(`/users/${id}/deactivate`, 'POST', {}),
    reactivate: (id) => request(`/users/${id}/reactivate`, 'POST', {}),
  };
}

module.exports = { initUsersApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const session = JSON.parse(window.sessionStorage.getItem('session') || 'null');
    const api = createDefaultApi(() => (session ? session.token : null));
    initUsersApp(document, [], api, session && session.user).reload();
  });
}
