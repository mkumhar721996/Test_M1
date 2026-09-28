const { escapeHtml } = require('./utils');

const FIELD_IDS = ['name', 'email', 'phone', 'department', 'role', 'start-date'];

function createToastController(doc) {
  const toast = doc.getElementById('toast');
  const toastMessage = doc.getElementById('toast-message');
  let toastTimer = null;
  return {
    show(message) {
      toastMessage.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
    },
  };
}

function reasonLabel(reasons) {
  if (reasons.length === 2) return 'Matched on email &amp; phone';
  return reasons[0] === 'email' ? 'Matched on email' : 'Matched on phone';
}

function bannerCopy(matches) {
  if (matches.length === 1) {
    return {
      title: 'Possible duplicate found',
      copy: 'The email or phone number you entered matches an existing profile. Link to it instead of creating a new one, or proceed if this is a different person.',
    };
  }
  return {
    title: matches.length + ' possible duplicates found',
    copy: 'The email or phone number you entered matches ' + matches.length + ' existing profiles. Link to one instead of creating a new one, or proceed if this is a different person.',
  };
}

function initHiresListApp(doc, initialHires, api) {
  let profiles = initialHires.map((p) => ({ ...p }));
  let pendingCandidate = null;

  const pageList = doc.getElementById('page-list');
  const screenConfirm = doc.getElementById('screen-confirm');
  const overlay = doc.getElementById('create-overlay');
  const modal = doc.getElementById('create-modal');
  const stepDetails = doc.getElementById('step-details');
  const stepDuplicates = doc.getElementById('step-duplicates');
  const form = doc.getElementById('create-form');
  const submitBtn = doc.getElementById('create-submit-btn');
  const toastController = createToastController(doc);

  function showToast(message) {
    toastController.show(message);
  }

  function statusLabel(p) {
    return p.profileStatus === 'active' ? 'Active profile' : 'Deactivated profile';
  }

  function renderProfilesTable() {
    const tbody = doc.getElementById('profiles-tbody');
    tbody.innerHTML = profiles.map((p) => `
      <tr>
        <td>${escapeHtml(doc, p.name)}${p.tag === 'linked' ? '<span class="row-tag">🔗 Linked just now</span>' : ''}${p.tag === 'new' ? '<span class="row-tag">＋ New</span>' : ''}</td>
        <td>${escapeHtml(doc, p.email)}</td>
        <td>${escapeHtml(doc, p.phone)}</td>
        <td>${escapeHtml(doc, p.department)}</td>
        <td><span class="profile-status-chip ${p.profileStatus === 'active' ? 'profile-status-chip--active' : ''}">${p.profileStatus === 'active' ? '● Active' : '— Deactivated'}</span></td>
      </tr>`).join('');
  }

  function matchCardHtml(match) {
    const p = match.profile;
    return `
      <div class="card match-card">
        <div class="match-card-header">
          <div>
            <h3 class="match-card-name">${escapeHtml(doc, p.name)}</h3>
            <p class="u-text-sm u-text-muted">${escapeHtml(doc, p.role)} · ${escapeHtml(doc, p.department)} · ${statusLabel(p)}</p>
          </div>
          <span class="chip match-chip">${reasonLabel(match.reasons)}</span>
        </div>
        <p class="u-text-sm match-card-contact">${escapeHtml(doc, p.email)} · ${escapeHtml(doc, p.phone)}</p>
        <div class="match-card-actions"><button type="button" class="btn btn-primary btn-sm" data-link-id="${escapeHtml(doc, p.id)}">Link to this profile</button></div>
      </div>`;
  }

  function fieldIds() {
    return FIELD_IDS;
  }

  function resetForm() {
    ['f-name', 'f-email', 'f-phone', 'f-department', 'f-role', 'f-start-date'].forEach((id) => {
      doc.getElementById(id).value = '';
    });
    fieldIds().forEach((id) => { doc.getElementById('err-' + id).hidden = true; });
    stepDetails.hidden = false;
    stepDuplicates.hidden = true;
    doc.getElementById('dup-proceed-confirm').hidden = true;
    pendingCandidate = null;
  }

  function openModal() {
    resetForm();
    overlay.hidden = false;
    modal.hidden = false;
    doc.getElementById('f-name').focus();
  }
  function closeModal() {
    overlay.hidden = true;
    modal.hidden = true;
  }

  doc.getElementById('add-hire-btn').addEventListener('click', openModal);
  doc.getElementById('create-close-btn').addEventListener('click', closeModal);
  doc.getElementById('create-cancel-btn').addEventListener('click', closeModal);
  doc.getElementById('dup-edit-btn').addEventListener('click', () => {
    stepDuplicates.hidden = true;
    stepDetails.hidden = false;
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  function validate(data) {
    const errors = {};
    if (!data.name.trim()) errors.name = true;
    if (!data.email.trim()) errors.email = true;
    if (!data.phone.trim()) errors.phone = true;
    if (!data.department.trim()) errors.department = true;
    if (!data.role.trim()) errors.role = true;
    if (!data.startDate.trim()) errors['start-date'] = true;
    return errors;
  }

  function showErrors(errors) {
    fieldIds().forEach((id) => {
      doc.getElementById('err-' + id).hidden = !errors[id];
    });
  }

  function renderDuplicateStep(matches, candidate) {
    const { title, copy } = bannerCopy(matches);
    doc.getElementById('dup-banner-title').textContent = title;
    doc.getElementById('dup-banner-copy').innerHTML = copy;
    doc.getElementById('dup-cards').innerHTML = matches.map((m) => matchCardHtml(m)).join('');
    doc.getElementById('dup-confirm-name').textContent = candidate.name;
    doc.getElementById('dup-proceed-confirm').hidden = true;
  }

  function summaryRows(p) {
    return [
      ['Name', p.name], ['Email', p.email], ['Phone', p.phone],
      ['Department', p.department], ['Role', p.role],
    ].map(([k, v]) => `<div class="summary-row"><span class="k">${escapeHtml(doc, k)}</span><span class="v">${escapeHtml(doc, v)}</span></div>`).join('');
  }

  function showConfirmScreen(outcome, profile) {
    const copyByOutcome = {
      linked: {
        pageTitle: 'Linked to existing profile',
        icon: '🔗',
        title: `${profile.name}’s existing profile is now the record to use.`,
        subtitle: 'No new profile was created. The details you entered were discarded in favor of the existing profile below.',
        cardTitle: 'Existing profile',
      },
      proceeded: {
        pageTitle: 'New profile created',
        icon: '✓',
        title: `Profile created for ${profile.name}.`,
        subtitle: 'You chose to proceed anyway, so a separate profile was created and the duplicate warning was dismissed.',
        cardTitle: 'New profile',
      },
      nomatch: {
        pageTitle: 'Profile created',
        icon: '✓',
        title: `Profile created for ${profile.name}.`,
        subtitle: 'No existing profile matched the email or phone entered, so it was created immediately — no duplicate warning was shown.',
        cardTitle: 'New profile',
      },
    };
    const c = copyByOutcome[outcome];
    doc.getElementById('confirm-page-title').textContent = c.pageTitle;
    doc.getElementById('confirm-icon').textContent = c.icon;
    doc.getElementById('confirm-title').textContent = c.title;
    doc.getElementById('confirm-subtitle').textContent = c.subtitle;
    doc.getElementById('confirm-card-title').textContent = c.cardTitle;
    doc.getElementById('confirm-summary').innerHTML = summaryRows(profile);
    pageList.hidden = true;
    screenConfirm.hidden = false;
  }

  doc.getElementById('confirm-back-btn').addEventListener('click', () => {
    screenConfirm.hidden = true;
    pageList.hidden = false;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: doc.getElementById('f-name').value,
      email: doc.getElementById('f-email').value,
      phone: doc.getElementById('f-phone').value,
      department: doc.getElementById('f-department').value,
      role: doc.getElementById('f-role').value,
      startDate: doc.getElementById('f-start-date').value,
    };
    const errors = validate(data);
    showErrors(errors);
    if (Object.keys(errors).length) {
      const firstErrorId = fieldIds().find((id) => errors[id]);
      if (firstErrorId) doc.getElementById('err-' + firstErrorId).previousElementSibling.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking for duplicates…';

    api.checkDuplicates({ email: data.email, phone: data.phone }).then((matches) => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save profile';

      if (matches.length === 0) {
        return api.createHire(data).then((created) => {
          created.tag = 'new';
          profiles.unshift(created);
          renderProfilesTable();
          closeModal();
          showConfirmScreen('nomatch', created);
          showToast('Profile created for ' + created.name + '.');
        });
      }

      pendingCandidate = data;
      renderDuplicateStep(matches, data);
      stepDetails.hidden = true;
      stepDuplicates.hidden = false;
      return undefined;
    }).catch(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save profile';
      showToast('Could not check for duplicates — please try again');
    });
  });

  doc.getElementById('dup-cards').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-link-id]');
    if (!btn) return;
    const profile = profiles.find((p) => p.id === btn.dataset.linkId);
    btn.disabled = true;
    btn.textContent = 'Linking…';
    profile.tag = 'linked';
    renderProfilesTable();
    closeModal();
    showConfirmScreen('linked', profile);
    showToast('Linked to ' + profile.name + '’s existing profile.');
  });

  doc.getElementById('dup-proceed-btn').addEventListener('click', () => {
    doc.getElementById('dup-proceed-confirm').hidden = false;
  });
  doc.getElementById('dup-proceed-cancel-btn').addEventListener('click', () => {
    doc.getElementById('dup-proceed-confirm').hidden = true;
  });
  doc.getElementById('dup-proceed-confirm-btn').addEventListener('click', function handleProceedConfirm() {
    const confirmBtn = this;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Creating…';
    api.createHire(pendingCandidate).then((created) => {
      created.tag = 'new';
      profiles.unshift(created);
      renderProfilesTable();
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, create new profile';
      stepDuplicates.hidden = true;
      doc.getElementById('dup-proceed-confirm').hidden = true;
      closeModal();
      showConfirmScreen('proceeded', created);
      showToast('Profile created for ' + created.name + '. Duplicate warning dismissed.');
    }).catch(() => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, create new profile';
      showToast('Could not create the profile — please try again');
    });
  });

  renderProfilesTable();
}

function createDefaultApi() {
  return {
    checkDuplicates: ({ email, phone }) => fetch(`/hires/duplicates?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`)
      .then((res) => res.json()),
    createHire: (data) => fetch('/hires', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((res) => res.json()),
  };
}

function bootHiresListPage(doc, fetchFn) {
  return fetchFn('/hires')
    .then((res) => res.json())
    .then((hires) => initHiresListApp(doc, hires, createDefaultApi()))
    .catch(() => {
      createToastController(doc).show('Failed to load profiles. Please refresh the page.');
    });
}

module.exports = { initHiresListApp, bootHiresListPage };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    bootHiresListPage(document, fetch);
  });
}
