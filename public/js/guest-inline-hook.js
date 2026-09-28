const { escapeHtml } = require('./utils');

function normalizePhone(v) {
  return (v || '').replace(/\D/g, '');
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhone(v) {
  return normalizePhone(v).length >= 7;
}

function validateFields({ name, email, phone }) {
  const fields = {};

  if (name === '') fields.name = "Enter the guest's full name.";

  let emailError = email !== '' && !isValidEmail(email) ? 'Enter a valid email address.' : '';
  let phoneError = phone !== '' && !isValidPhone(phone) ? 'Enter a valid phone number.' : '';

  if (email === '' && phone === '') {
    emailError = emailError || 'Add an email or phone number so we can check for existing profiles.';
    phoneError = phoneError || 'Add an email or phone number so we can check for existing profiles.';
  }

  if (emailError) fields.email = emailError;
  if (phoneError) fields.phone = phoneError;

  return fields;
}

const TEMPLATE = `
  <div class="notice" id="permission-denied-notice" role="status" aria-live="assertive" hidden>
    <span class="notice-icon" aria-hidden="true">⛔</span>
    <div>
      <p><strong>You don't have permission to create or select guest profiles.</strong></p>
      <p>This is the same outcome you'd get creating a guest profile directly — ask a manager for access. No profile was created or linked to this reservation.</p>
    </div>
  </div>

  <form id="hook-form" novalidate>
    <p class="u-text-sm u-text-muted" style="margin: 0 0 var(--space-4) 0;">
      Search by email or phone to find an existing guest, or fill in the details below to create a new profile.
    </p>

    <div class="notice" id="service-error-notice" role="status" aria-live="assertive" hidden>
      <span class="notice-icon" aria-hidden="true">⚠</span>
      <div>
        <p><strong>Couldn't create guest profile — please try again.</strong></p>
        <p>Nothing was saved. Your entries below are unchanged.</p>
      </div>
    </div>

    <div class="field">
      <label class="label" for="field-name">Full name</label>
      <input class="input" id="field-name" name="name" type="text" placeholder="e.g. Alex Rivera" aria-describedby="error-name" />
      <p class="field-error" id="error-name" role="alert" hidden>⚠ Enter the guest's full name.</p>
    </div>

    <div class="field">
      <label class="label" for="field-email">Email</label>
      <input class="input" id="field-email" name="email" type="email" placeholder="name@example.com" aria-describedby="error-email dup-status" />
      <p class="field-error" id="error-email" role="alert" hidden>⚠ Enter a valid email address.</p>
    </div>

    <div class="field" style="margin-bottom: 0;">
      <label class="label" for="field-phone">Phone</label>
      <input class="input" id="field-phone" name="phone" type="tel" placeholder="(555) 123-4567" aria-describedby="error-phone dup-status" />
      <p class="field-error" id="error-phone" role="alert" hidden>⚠ Enter a valid phone number.</p>
      <span class="hint">Enter an email, a phone number, or both — at least one is needed to check for an existing profile.</span>
    </div>

    <div class="dup-status" id="dup-status" aria-live="polite" hidden>
      <span class="spinner" aria-hidden="true"></span>
      <span id="dup-status-text">Checking for existing profiles…</span>
    </div>

    <div class="dup-match" id="dup-match" hidden role="status" aria-live="polite">
      <p class="dup-match-title"><span aria-hidden="true">ℹ</span> We found a matching profile</p>
      <div id="dup-match-list"></div>
      <button type="button" class="link-btn" id="dismiss-match-btn" style="padding-left:0;">Continue creating a new profile instead</button>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" id="hook-cancel-btn">Cancel</button>
      <button type="submit" class="btn btn-primary" id="hook-submit-btn">Create guest profile</button>
    </div>
  </form>
`;

function mountGuestInlineHook(container, { role, api, onLinked, onEvent } = {}) {
  if (!api || typeof api.checkPermission !== 'function' || typeof api.checkMatch !== 'function' || typeof api.createGuest !== 'function') {
    throw new Error('mountGuestInlineHook requires an api object with checkPermission, checkMatch, and createGuest methods');
  }

  container.innerHTML = TEMPLATE;
  container.querySelector('#hook-form').hidden = true;

  const emit = (name, payload) => { if (onEvent) onEvent(name, payload); };
  const link = (payload) => { if (onLinked) onLinked(payload); };

  const permissionDeniedNotice = container.querySelector('#permission-denied-notice');
  const hookForm = container.querySelector('#hook-form');
  const serviceErrorNotice = container.querySelector('#service-error-notice');

  const fieldName = container.querySelector('#field-name');
  const fieldEmail = container.querySelector('#field-email');
  const fieldPhone = container.querySelector('#field-phone');
  const errorName = container.querySelector('#error-name');
  const errorEmail = container.querySelector('#error-email');
  const errorPhone = container.querySelector('#error-phone');

  const dupStatus = container.querySelector('#dup-status');
  const dupMatch = container.querySelector('#dup-match');
  const dupMatchList = container.querySelector('#dup-match-list');
  const dismissMatchBtn = container.querySelector('#dismiss-match-btn');
  const hookCancelBtn = container.querySelector('#hook-cancel-btn');
  const hookSubmitBtn = container.querySelector('#hook-submit-btn');

  const doc = container.ownerDocument || document;

  let dupTimer = null;
  let currentMatch = null;

  function setFieldError(fieldEl, errorEl, message) {
    if (message) {
      errorEl.hidden = false;
      errorEl.textContent = '⚠ ' + message;
      fieldEl.classList.add('input-invalid');
      fieldEl.setAttribute('aria-invalid', 'true');
    } else {
      errorEl.hidden = true;
      fieldEl.classList.remove('input-invalid');
      fieldEl.setAttribute('aria-invalid', 'false');
    }
  }

  function clearAllErrors() {
    setFieldError(fieldName, errorName, '');
    setFieldError(fieldEmail, errorEmail, '');
    setFieldError(fieldPhone, errorPhone, '');
  }

  function hideDupStatus() { dupStatus.hidden = true; }

  function renderMatch(match) {
    dupMatchList.innerHTML = `
      <div class="dup-match-card">
        <div>
          <div class="dup-match-name">${escapeHtml(doc, match.name)}</div>
          <div class="dup-match-meta">${escapeHtml(doc, match.email)} · ${escapeHtml(doc, match.id)}</div>
        </div>
        <button type="button" class="btn btn-secondary" id="use-match-btn">Use this profile</button>
      </div>`;
    dupMatch.hidden = false;
    container.querySelector('#use-match-btn').addEventListener('click', () => selectExistingGuest(match));
  }

  function selectExistingGuest(guest) {
    const payload = { guestId: guest.id, displayName: guest.name, source: 'existing' };
    link(payload);
    emit('guest.linked', payload);
    close();
  }

  function scheduleDupCheck() {
    clearTimeout(dupTimer);
    dupMatch.hidden = true;
    currentMatch = null;
    const email = fieldEmail.value.trim();
    const phone = fieldPhone.value.trim();
    const emailLooksReal = email.includes('@');
    const phoneLooksReal = normalizePhone(phone).length >= 7;
    if (!emailLooksReal && !phoneLooksReal) {
      hideDupStatus();
      return;
    }
    dupStatus.hidden = false;
    dupTimer = setTimeout(() => {
      api.checkMatch({ email: emailLooksReal ? email : '', phone: phoneLooksReal ? phone : '' }).then((match) => {
        hideDupStatus();
        if (match) {
          currentMatch = match;
          renderMatch(match);
        }
      }).catch(() => {
        hideDupStatus();
      });
    }, 350);
  }

  fieldEmail.addEventListener('input', scheduleDupCheck);
  fieldPhone.addEventListener('input', scheduleDupCheck);
  dismissMatchBtn.addEventListener('click', () => {
    dupMatch.hidden = true;
    currentMatch = null;
  });
  hookCancelBtn.addEventListener('click', close);

  hookForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();
    serviceErrorNotice.hidden = true;

    const name = fieldName.value.trim();
    const email = fieldEmail.value.trim();
    const phone = fieldPhone.value.trim();

    const fields = validateFields({ name, email, phone });

    setFieldError(fieldName, errorName, fields.name || '');
    setFieldError(fieldEmail, errorEmail, fields.email || '');
    setFieldError(fieldPhone, errorPhone, fields.phone || '');

    if (Object.keys(fields).length > 0) {
      emit('guest.validation_error', { invalidFields: Object.keys(fields) });
      return;
    }

    hookSubmitBtn.disabled = true;
    hookSubmitBtn.textContent = 'Creating…';

    api.createGuest({ name, email, phone }).then((result) => {
      if (result.ok) {
        const payload = { guestId: result.guest.id, displayName: result.guest.name, source: 'created' };
        link(payload);
        emit('guest.created', payload);
        close();
        return;
      }

      if (result.kind === 'validation') {
        hookSubmitBtn.disabled = false;
        hookSubmitBtn.textContent = 'Create guest profile';
        setFieldError(fieldName, errorName, result.fields.name || '');
        setFieldError(fieldEmail, errorEmail, result.fields.email || '');
        setFieldError(fieldPhone, errorPhone, result.fields.phone || '');
        emit('guest.validation_error', { invalidFields: Object.keys(result.fields) });
        return;
      }

      if (result.kind === 'forbidden') {
        showPermissionDenied();
        return;
      }

      hookSubmitBtn.disabled = false;
      hookSubmitBtn.textContent = 'Create guest profile';
      serviceErrorNotice.hidden = false;
      emit('guest.service_error', { reason: 'network_error', persisted: false });
    }).catch(() => {
      hookSubmitBtn.disabled = false;
      hookSubmitBtn.textContent = 'Create guest profile';
      serviceErrorNotice.hidden = false;
      emit('guest.service_error', { reason: 'network_error', persisted: false });
    });
  });

  function showPermissionDenied() {
    permissionDeniedNotice.hidden = false;
    hookForm.hidden = true;
    emit('guest.permission_denied', { reason: 'insufficient_permissions' });
  }

  function showForm() {
    permissionDeniedNotice.hidden = true;
    hookForm.hidden = false;
    hookForm.reset();
    clearAllErrors();
  }

  function open() {
    return api.checkPermission().then(({ allowed }) => {
      if (!allowed) {
        showPermissionDenied();
        return;
      }
      showForm();
    }).catch(() => {
      // Fail closed: an unresolvable permission check must never grant access.
      showPermissionDenied();
    });
  }

  function close() {
    hookForm.reset();
    clearAllErrors();
    hideDupStatus();
    dupMatch.hidden = true;
    currentMatch = null;
    permissionDeniedNotice.hidden = true;
    serviceErrorNotice.hidden = true;
    hookSubmitBtn.disabled = false;
    hookSubmitBtn.textContent = 'Create guest profile';
    clearTimeout(dupTimer);
  }

  return { open, close };
}

function createDefaultApi(role) {
  const headers = { 'x-staff-role': role, 'Content-Type': 'application/json' };

  return {
    checkPermission: () => fetch('/guests/permission', { headers })
      .then((res) => res.json())
      .catch(() => ({ allowed: false })),
    checkMatch: ({ email, phone }) => {
      const params = new URLSearchParams();
      if (email) params.set('email', email);
      if (phone) params.set('phone', phone);
      return fetch(`/guests/match?${params.toString()}`, { headers })
        .then((res) => res.json())
        .then((body) => body.match)
        .catch(() => null);
    },
    createGuest: (data) => fetch('/guests', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (res.status === 201) {
        const guest = await res.json();
        return { ok: true, guest };
      }
      if (res.status === 400) {
        const body = await res.json();
        return { ok: false, kind: 'validation', fields: body.fields };
      }
      if (res.status === 403) {
        return { ok: false, kind: 'forbidden' };
      }
      return { ok: false, kind: 'service_error' };
    }).catch(() => ({ ok: false, kind: 'service_error' })),
  };
}

module.exports = { mountGuestInlineHook, createDefaultApi };
