const STAGE_LABELS = {
  draft: 'Draft',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer_extended: 'Offer extended',
  offer_accepted: 'Offer accepted',
  onboarding_in_progress: 'Onboarding in progress',
  completed: 'Completed',
};
const STAGE_ICONS = {
  draft: '○',
  applied: '○',
  screening: '◔',
  interview: '◑',
  offer_extended: '◕',
  offer_accepted: '◐',
  onboarding_in_progress: '◑',
  completed: '✓',
};

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateDisplay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function initHireProfilesApp(doc, initialHires, api) {
  let profiles = initialHires.slice();
  let formMode = 'create';
  let editingId = null;
  let lastAddedId = null;
  let toastTimer = null;

  const $ = (id) => doc.getElementById(id);
  const tbody = $('profile-tbody');
  const overlay = $('modal-overlay');
  const modalWrap = $('modal-wrap');
  const modalTitle = $('modal-title');
  const modalSubtitle = $('modal-subtitle');
  const rehireBanner = $('rehire-banner');
  const form = $('profile-form');
  const saveBtn = $('modal-save-btn');
  const fields = {
    name: { input: $('field-name'), error: $('error-name') },
    email: { input: $('field-email'), error: $('error-email') },
    phone: { input: $('field-phone'), error: $('error-phone') },
    department: { input: $('field-department'), error: $('error-department') },
    role: { input: $('field-role'), error: $('error-role') },
    startDate: { input: $('field-start-date'), error: $('error-start-date') },
  };
  const fieldHireStage = $('field-hire-stage');

  function showToast(message) {
    $('toast-message').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }

  function renderList() {
    if (profiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No new-hire profiles yet.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = profiles.map((p) => {
      const emailLine = p.email
        ? `<span class="contact-line"><span aria-hidden="true">✉</span> ${escapeHtml(p.email)}</span>`
        : '<span class="contact-line not-set">No email on file</span>';
      const phoneLine = p.phone
        ? `<span class="contact-line"><span aria-hidden="true">☎</span> ${escapeHtml(p.phone)}</span>`
        : '<span class="contact-line not-set">No phone on file</span>';
      const rehireBtn = p.hireStage === 'completed'
        ? `<button type="button" class="edit-link btn-sm" data-rehire-id="${escapeHtml(p.id)}">Create rehire profile</button>`
        : '';
      return `<tr${p.id === lastAddedId ? ' class="row-added"' : ''}>
        <td class="name-cell"><span class="person-name">${escapeHtml(p.name)}</span><span class="person-id">${escapeHtml(p.id)}</span></td>
        <td class="contact-cell">${emailLine}${phoneLine}</td>
        <td class="role-cell"><span class="role-line">${escapeHtml(p.role)}</span><br/><span class="dept-line">${escapeHtml(p.department)}</span></td>
        <td>${formatDateDisplay(p.startDate)}</td>
        <td><span class="stage-chip stage-chip--${escapeHtml(p.hireStage)}"><span aria-hidden="true">${STAGE_ICONS[p.hireStage] || ''}</span> ${escapeHtml(STAGE_LABELS[p.hireStage] || p.hireStage)}</span></td>
        <td class="col-actions">
          <button type="button" class="edit-link btn-sm" data-edit-id="${escapeHtml(p.id)}">Edit</button>
          ${rehireBtn}
        </td>
      </tr>`;
    }).join('');
    lastAddedId = null;
  }

  function setFieldError(key, message) {
    const { input, error } = fields[key];
    error.hidden = !message;
    if (message) error.textContent = `⚠ ${message}`;
    input.classList.toggle('input-invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearAllErrors() {
    Object.keys(fields).forEach((key) => setFieldError(key, ''));
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelForm();
    }
  }

  function openModal({ mode, id = null, title, subtitle, saveLabel, banner, values }) {
    formMode = mode;
    editingId = id;
    form.reset();
    clearAllErrors();
    rehireBanner.hidden = !banner;
    fields.name.input.value = values.name || '';
    fields.email.input.value = values.email || '';
    fields.phone.input.value = values.phone || '';
    fields.department.input.value = values.department || '';
    fields.role.input.value = values.role || '';
    fields.startDate.input.value = values.startDate || '';
    fieldHireStage.value = values.hireStage || 'draft';
    modalTitle.textContent = title;
    modalSubtitle.textContent = subtitle;
    saveBtn.textContent = saveLabel;
    overlay.hidden = false;
    modalWrap.hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
    fields.name.input.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    saveBtn.disabled = false;
    doc.removeEventListener('keydown', onModalKeydown);
  }

  function cancelForm() {
    const wasEdit = formMode === 'edit';
    closeModal();
    showToast(wasEdit ? 'No changes saved — dialog closed' : 'No profile created — dialog closed');
  }

  function openCreateModal() {
    openModal({
      mode: 'create',
      title: 'New hire profile',
      subtitle: 'Name, email, phone, department, role, and start date are all required.',
      saveLabel: 'Create profile',
      values: {},
    });
  }

  function openEditModal(id) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    openModal({
      mode: 'edit',
      id,
      title: 'Edit profile',
      subtitle: `Profile ${p.id}. Update any field and save.`,
      saveLabel: 'Save changes',
      values: p,
    });
  }

  // Rehire opens the CREATE form pre-filled from the prior profile; nothing links the two records.
  function openRehireModal(priorId) {
    const prior = profiles.find((x) => x.id === priorId);
    if (!prior) return;
    openModal({
      mode: 'create',
      title: 'New hire profile',
      subtitle: `Rehiring ${prior.name}. Name, email, phone, department, role, and start date are all required.`,
      saveLabel: 'Create profile',
      banner: true,
      values: { name: prior.name, department: prior.department, role: prior.role },
    });
  }

  tbody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) return openEditModal(editBtn.getAttribute('data-edit-id'));
    const rehireBtn = e.target.closest('[data-rehire-id]');
    if (rehireBtn) openRehireModal(rehireBtn.getAttribute('data-rehire-id'));
  });
  $('new-profile-btn').addEventListener('click', openCreateModal);
  $('modal-close-btn').addEventListener('click', cancelForm);
  $('modal-cancel-btn').addEventListener('click', cancelForm);
  overlay.addEventListener('click', cancelForm);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {
      name: fields.name.input.value.trim(),
      email: fields.email.input.value.trim(),
      phone: fields.phone.input.value.trim(),
      department: fields.department.input.value,
      role: fields.role.input.value.trim(),
      startDate: fields.startDate.input.value,
      hireStage: fieldHireStage.value,
    };
    const messages = {
      name: values.name ? '' : 'Full name is required.',
      email: values.email ? '' : 'Email is required.',
      phone: values.phone ? '' : 'Phone is required.',
      department: values.department ? '' : 'Department is required.',
      role: values.role ? '' : 'Role is required.',
      startDate: values.startDate ? '' : 'Start date is required.',
    };
    Object.keys(messages).forEach((key) => setFieldError(key, messages[key]));
    const firstInvalid = Object.keys(messages).find((key) => messages[key]);
    if (firstInvalid) {
      fields[firstInvalid].input.focus();
      return;
    }

    const wasEdit = formMode === 'edit';
    saveBtn.disabled = true;
    const request = wasEdit ? api.update(editingId, values) : api.create(values);
    return Promise.resolve(request).then((saved) => {
      profiles = wasEdit
        ? profiles.map((p) => (p.id === saved.id ? saved : p))
        : [saved, ...profiles];
      lastAddedId = saved.id;
      closeModal();
      renderList();
      showToast(wasEdit ? 'Profile updated' : 'Profile created');
    }, (err) => {
      saveBtn.disabled = false;
      if (err && (err.status === 401 || err.status === 403)) {
        showToast(`Request rejected — HR or Manager role required. ${wasEdit ? 'No changes were saved' : 'No profile was created'}.`);
        return;
      }
      const serverFields = err && err.fields;
      if (serverFields) {
        Object.keys(fields).forEach((key) => { if (serverFields[key]) setFieldError(key, serverFields[key]); });
      }
      showToast('Could not save the profile — please try again');
    });
  });

  renderList();
}

function createDefaultApi(getRole = () => 'manager') {
  function request(url, method, body, roleOverride) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-staff-role': roleOverride || getRole() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  return {
    // This page has no per-user identity (no x-staff-name), so a "manager" here could never match a
    // profile's hiringManager under the scoped /hires rules; reads and edits go through as HR instead.
    list: () => request('/hires', 'GET', undefined, 'hr'),
    create: (data) => request('/hires', 'POST', data),
    update: (id, changes) => request(`/hires/${id}`, 'PATCH', changes, getRole() === 'manager' ? 'hr' : undefined),
  };
}

if (typeof module !== 'undefined') module.exports = { initHireProfilesApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role-select');
    const api = createDefaultApi(() => roleSelect.value);
    api.list().then((hires) => initHireProfilesApp(document, hires, api));
  });
}
