function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ALL_ROLES = ['admin', 'finance', 'employee'];
const ROLE_LABELS = { admin: 'Admin', finance: 'Finance', employee: 'Employee' };
const ROLE_DESCRIPTIONS = {
  admin: 'Full access, including creating and managing user accounts.',
  finance: 'Approves expenses and manages financial records.',
  employee: 'Logs and views their own expenses.',
};
const DENIED_COPY = 'User & role management is limited to Admin and Finance accounts. Ask an administrator for the Admin or Finance role.';
const NOT_SIGNED_IN_COPY = 'Your session has ended or you are not signed in. Sign in to manage user accounts.';
const ROLES_REQUIRED_COPY = '⚠ Select at least one role so this account has permissions to sign in with.';

const ROW_ACTIONS = {
  EDIT: 'edit',
  TOGGLE_STATUS: 'toggle-status',
};

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function roleChipHtml(role) {
  const cls = role === 'admin' ? 'chip role-chip role-chip--admin' : 'chip role-chip';
  return `<span class="${cls}">${escapeHtml(ROLE_LABELS[role] || role)}</span>`;
}

function statusChipHtml(status) {
  if (status === 'active') return '<span class="status-chip status-chip--active"><span aria-hidden="true">●</span> Active</span>';
  return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">◌</span> Deactivated</span>';
}

function initUsersApp(doc, initialUsers, api, viewer) {
  let users = initialUsers.slice();
  let editingUserId = null;
  let deactivatingUserId = null;

  const viewerSelect = doc.getElementById('viewer-select');
  const accessDenied = doc.getElementById('um-access-denied');
  const accessDeniedCopy = doc.getElementById('um-access-denied-copy');
  const signInLink = doc.getElementById('um-signin-link');
  const content = doc.getElementById('um-content');
  const tableWrap = doc.getElementById('um-table-wrap');
  const emptyState = doc.getElementById('um-empty');
  const tbody = doc.getElementById('user-tbody');
  const resultsCount = doc.getElementById('um-results-count');
  const searchInput = doc.getElementById('user-search-input');
  const tempNote = doc.getElementById('temp-password-note');
  const tempText = doc.getElementById('temp-password-text');

  function showToast(message) {
    const el = doc.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span aria-hidden="true">✓</span><span>${escapeHtml(message)}</span>`;
    doc.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function findUser(id) {
    return users.find((u) => u.id === id) || null;
  }

  function renderViewer() {
    viewerSelect.innerHTML = viewer
      ? `<option value="${escapeHtml(viewer.id)}">${escapeHtml(viewer.name)}</option>`
      : '<option value="">Not signed in</option>';
    viewerSelect.disabled = true;
  }

  function renderLoading() {
    tableWrap.hidden = false;
    emptyState.hidden = true;
    resultsCount.textContent = 'Loading user accounts…';
    let rows = '';
    for (let i = 0; i < 3; i += 1) {
      rows += '<tr class="skeleton-row"><td><div class="skeleton-bar"></div></td><td><div class="skeleton-bar short"></div></td><td><div class="skeleton-bar short"></div></td><td><div class="skeleton-bar short"></div></td><td></td></tr>';
    }
    tbody.innerHTML = rows;
  }

  function renderTable() {
    const query = searchInput.value;
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

    if (list.length === 0) {
      tableWrap.hidden = true;
      emptyState.hidden = false;
      emptyState.querySelector('.empty-query').textContent = query;
      resultsCount.textContent = `Showing 0 accounts for "${query}".`;
      return;
    }

    tableWrap.hidden = false;
    emptyState.hidden = true;
    resultsCount.textContent = q
      ? `Showing ${list.length} ${list.length === 1 ? 'account' : 'accounts'} for "${query}".`
      : `Showing ${list.length} accounts — ${users.filter((u) => u.status === 'active').length} active.`;

    tbody.innerHTML = list.map((u) => {
      const active = u.status === 'active';
      const toggleCls = active ? 'row-action-btn danger-text' : 'row-action-btn';
      const historyHref = `user-history.html?id=${encodeURIComponent(u.id)}`;
      return '<tr>' +
        `<td class="user-name-cell">${escapeHtml(u.name)}<span class="user-email">${escapeHtml(u.email)}</span></td>` +
        `<td><div class="role-chips">${u.roles.map(roleChipHtml).join('')}</div></td>` +
        `<td>${statusChipHtml(u.status)}</td>` +
        `<td>${fmtDateTime(u.lastActive)}</td>` +
        '<td class="col-actions">' +
          `<button type="button" class="row-action-btn" data-action="${ROW_ACTIONS.EDIT}" data-user-id="${escapeHtml(u.id)}">Edit roles</button>` +
          `<button type="button" class="${toggleCls}" data-action="${ROW_ACTIONS.TOGGLE_STATUS}" data-user-id="${escapeHtml(u.id)}">${active ? 'Deactivate' : 'Reactivate'}</button>` +
          `<a class="row-action-btn" href="${historyHref}">View history</a>` +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function refreshForViewer() {
    accessDenied.hidden = true;
    content.hidden = false;
    renderLoading();
    return api.list().then((data) => {
      users = data;
      renderTable();
    }).catch((err) => {
      users = [];
      content.hidden = true;
      accessDenied.hidden = false;
      const unauthenticated = !!err && err.status === 401;
      signInLink.hidden = !unauthenticated;
      accessDeniedCopy.textContent = unauthenticated
        ? NOT_SIGNED_IN_COPY
        : (err && err.body && err.body.message) || DENIED_COPY;
    });
  }

  searchInput.addEventListener('input', renderTable);
  doc.getElementById('um-clear-search-btn').addEventListener('click', () => {
    searchInput.value = '';
    renderTable();
  });
  doc.getElementById('temp-password-dismiss').addEventListener('click', () => { tempNote.hidden = true; });

  /* ---------------- Create / Edit modal ---------------- */
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

  function renderRoleChecklist(checkedRoles) {
    roleChecklist.innerHTML = ALL_ROLES.map((role) => (
      '<label class="role-option">' +
        `<input type="checkbox" value="${role}"${checkedRoles.includes(role) ? ' checked' : ''} />` +
        `<span class="role-option-text"><strong>${ROLE_LABELS[role]}</strong><span>${ROLE_DESCRIPTIONS[role]}</span></span>` +
      '</label>'
    )).join('');
  }

  function clearFormErrors() {
    rolesError.hidden = true;
    nameError.hidden = true;
    emailError.hidden = true;
    nameInput.classList.remove('input-error');
    emailInput.classList.remove('input-error');
  }

  function showRolesError(text) {
    rolesError.textContent = text || ROLES_REQUIRED_COPY;
    rolesError.hidden = false;
    const first = roleChecklist.querySelector('input');
    if (first) first.focus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
    modalWrap.hidden = true;
    editingUserId = null;
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
    modalOverlay.hidden = false;
    modalWrap.hidden = false;
    nameInput.focus();
  }

  function openEditModal(userId) {
    const u = findUser(userId);
    if (!u) return;
    editingUserId = userId;
    doc.getElementById('user-modal-title').textContent = 'Edit roles';
    doc.getElementById('user-modal-subtitle').textContent = `Update ${u.name}’s roles. Changes apply on their next action — no new account needed.`;
    saveBtn.textContent = 'Save changes';
    nameField.hidden = true;
    emailField.hidden = true;
    clearFormErrors();
    renderRoleChecklist(u.roles);
    modalOverlay.hidden = false;
    modalWrap.hidden = false;
    roleChecklist.querySelector('input').focus();
  }

  doc.getElementById('new-user-btn').addEventListener('click', openCreateModal);
  doc.getElementById('user-modal-close-btn').addEventListener('click', closeModal);
  doc.getElementById('user-modal-cancel-btn').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  roleChecklist.addEventListener('change', () => { rolesError.hidden = true; });

  function showServerErrors(err) {
    const fields = (err && err.body && err.body.fields) || {};
    if (fields.roles) showRolesError(`⚠ ${fields.roles}`);
    if (fields.name) {
      nameError.textContent = `⚠ ${fields.name}`;
      nameError.hidden = false;
      nameInput.classList.add('input-error');
    }
    if (fields.email) {
      emailError.textContent = `⚠ ${fields.email}`;
      emailError.hidden = false;
      emailInput.classList.add('input-error');
    }
    if (!fields.roles && !fields.name && !fields.email) {
      showToast('The change could not be saved — please try again.');
    }
  }

  userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors();
    const checked = Array.from(roleChecklist.querySelectorAll('input:checked')).map((i) => i.value);
    if (checked.length === 0) {
      showRolesError();
      return;
    }

    if (editingUserId) {
      const id = editingUserId;
      api.updateRoles(id, checked).then((updated) => {
        const idx = users.findIndex((u) => u.id === updated.id);
        if (idx !== -1) users[idx] = Object.assign({}, users[idx], updated);
                closeModal();
        renderTable();
        showToast(`Roles updated for ${updated.name} — changes apply on their next action.`);
      }).catch(showServerErrors);
      return;
    }

    api.create({ name: nameInput.value.trim(), email: emailInput.value.trim(), roles: checked }).then((created) => {
      const { temporaryPassword, ...user } = created;
      users.unshift(user);
            closeModal();
      renderTable();
      if (temporaryPassword) {
        tempText.textContent = `Temporary password for ${user.name}: `;
        const code = doc.createElement('span');
        code.className = 'temp-password';
        code.textContent = temporaryPassword;
        tempText.appendChild(code);
        tempText.appendChild(doc.createTextNode(' — share it securely; it is shown only once.'));
        tempNote.hidden = false;
      }
      showToast(`Account created — ${user.name} can now sign in.`);
    }).catch(showServerErrors);
  });

  /* ---------------- Deactivate / reactivate ---------------- */
  const deactivateOverlay = doc.getElementById('deactivate-modal-overlay');
  const deactivateWrap = doc.getElementById('deactivate-modal-wrap');

  function closeDeactivateModal() {
    deactivateOverlay.hidden = true;
    deactivateWrap.hidden = true;
    deactivatingUserId = null;
  }

  function openDeactivateModal(userId) {
    const u = findUser(userId);
    if (!u) return;
    deactivatingUserId = userId;
    doc.getElementById('deactivate-modal-body').textContent =
      `Deactivate ${u.name}’s account? They will no longer be able to sign in. Expenses they created or approved will remain visible as read-only history tied to their account.`;
    deactivateOverlay.hidden = false;
    deactivateWrap.hidden = false;
    doc.getElementById('deactivate-cancel-btn').focus();
  }

  function applyStatusChange(updated, message) {
    const idx = users.findIndex((u) => u.id === updated.id);
    if (idx !== -1) users[idx] = Object.assign({}, users[idx], updated);
        renderTable();
    showToast(message);
  }

  doc.getElementById('deactivate-modal-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);

  doc.getElementById('deactivate-confirm-btn').addEventListener('click', () => {
    const id = deactivatingUserId;
    if (!id) return;
    api.deactivate(id).then((updated) => {
      closeDeactivateModal();
      applyStatusChange(updated, `${updated.name}’s account is deactivated. Their expense history stays visible as read-only.`);
    }).catch(() => {
      closeDeactivateModal();
      showToast('Deactivation could not be completed — please try again.');
    });
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-user-id');
    const actionId = btn.getAttribute('data-action');
    if (actionId === ROW_ACTIONS.EDIT) {
      openEditModal(id);
      return;
    }
    if (actionId === ROW_ACTIONS.TOGGLE_STATUS) {
      const u = findUser(id);
      if (!u) return;
      if (u.status === 'active') {
        openDeactivateModal(id);
        return;
      }
      api.reactivate(id).then((updated) => {
        applyStatusChange(updated, `${updated.name}’s account is active again — they can sign in.`);
      }).catch(() => showToast('Reactivation could not be completed — please try again.'));
    }
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalWrap.hidden) closeModal();
    if (!deactivateWrap.hidden) closeDeactivateModal();
  });

  renderViewer();
  renderTable();

  return { refreshForViewer };
}

function createDefaultApi(getToken) {
  function request(url, method, body) {
    const opts = {
      method,
      headers: { Authorization: `Bearer ${getToken()}` },
    };
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
    updateRoles: (id, roles) => request(`/users/${encodeURIComponent(id)}/roles`, 'PATCH', { roles }),
    deactivate: (id) => request(`/users/${encodeURIComponent(id)}/deactivate`, 'POST', {}),
    reactivate: (id) => request(`/users/${encodeURIComponent(id)}/reactivate`, 'POST', {}),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { initUsersApp, createDefaultApi };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    let session = null;
    try { session = JSON.parse(window.sessionStorage.getItem('session')); } catch (e) { /* no session */ }
    const viewer = session && session.token ? { id: session.id, name: session.name } : null;
    const api = createDefaultApi(() => (session && session.token) || '');
    api.list().then(
      (users) => { initUsersApp(document, users, api, viewer); },
      () => { initUsersApp(document, [], api, viewer).refreshForViewer(); }
    );
  });
}
