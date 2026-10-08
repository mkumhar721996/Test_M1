(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { escapeHtml, formatDateDisplay } = isNode ? require('./utils') : window.EmployeeUtils;
  const HireActors = isNode ? require('./hire-actors') : window.HireActors;

  const STAGE_LABELS = {
    draft: 'Draft',
    applied: 'Applied',
    screening: 'Screening',
    interview: 'Interview',
    offer_extended: 'Offer extended',
    offer_accepted: 'Offer accepted',
  };

  const EDIT_FIELDS = [
    { key: 'name', input: 'field-name', wrap: 'field-wrap-name', error: 'error-name', required: true },
    { key: 'email', input: 'field-email', wrap: 'field-wrap-email', error: 'error-email', required: true },
    { key: 'phone', input: 'field-phone', wrap: 'field-wrap-phone', error: 'error-phone', required: true },
    { key: 'department', input: 'field-department', wrap: 'field-wrap-department', error: 'error-department', required: true },
    { key: 'role', input: 'field-role', wrap: 'field-wrap-role', error: 'error-role', required: true },
    { key: 'startDate', input: 'field-start-date', wrap: 'field-wrap-start-date', error: 'error-start-date', required: true },
    { key: 'hiringManager', input: 'field-hiring-manager', wrap: 'field-wrap-hiring-manager', error: 'error-hiring-manager', required: false },
  ];

  function denialText(reason, tenant) {
    switch (reason) {
      case 'cross_tenant': return `This profile belongs to a different tenant and isn't accessible from ${tenant}.`;
      case 'not_direct_report': return "This profile isn't one of your direct reports, so you don't have permission to view it.";
      case 'not_own_profile': return 'You can only view your own profile.';
      case 'not_found': return "This profile doesn't exist.";
      default: return "You don't have permission to view this profile.";
    }
  }

  function onboardingChip(status) {
    if (status === 'completed') return '<span class="status-chip status-chip--active"><span aria-hidden="true">✓</span> Completed</span>';
    if (status === 'in_progress') return '<span class="status-chip status-chip--neutral"><span aria-hidden="true">⏳</span> In progress</span>';
    return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">—</span> Not started</span>';
  }

  function statusChip(status) {
    return status === 'deactivated'
      ? '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">⏸</span> Deactivated</span>'
      : '<span class="status-chip status-chip--active"><span aria-hidden="true">✓</span> Active</span>';
  }

  function initHireAccessApp(doc, actor, result, api = {}, onBack = () => {}) {
    const $ = (id) => doc.getElementById(id);
    const tenant = actor.tenant || HireActors.TENANT;
    let hire = result.allowed ? result.hire : null;
    let toastTimer = null;

    const isSelf = actor.role === 'new_hire';
    const canMutate = actor.role === 'hr';
    const esc = (v) => escapeHtml(doc, v);
    const orNotSet = (v, label) => (v ? esc(v) : `<span class="not-set">${label}</span>`);

    $('profile-back-btn').onclick = onBack;
    $('tenant-badge-top').lastChild.textContent = ` ${tenant}`;

    function showToast(message) {
      $('toast-message').textContent = message;
      $('toast').classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { $('toast').classList.remove('is-visible'); }, 3500);
    }

    function kvRows(rows) {
      return rows.map(([k, v]) => `<div class="kv-row"><span class="kv-label">${k}</span><span class="kv-value">${v}</span></div>`).join('');
    }

    function renderViewable() {
      $('profile-denied-state').hidden = true;
      $('profile-viewable-state').hidden = false;
      $('profile-name').textContent = hire.name;
      $('profile-status-chip').innerHTML = statusChip(hire.profileStatus);

      const common = [
        ['Email', orNotSet(hire.email, 'Not provided')],
        ['Phone', orNotSet(hire.phone, 'Not provided')],
        ['Department', esc(hire.department)],
        ['Role / title', esc(hire.role)],
        ['Start date', formatDateDisplay(hire.startDate)],
      ];
      if (isSelf) {
        $('profile-card-title').textContent = 'My profile';
        $('profile-sub').textContent = 'Personal details & onboarding status';
        $('profile-kv-list').innerHTML = kvRows([
          ...common,
          ['Your hiring manager', orNotSet(hire.hiringManager, 'Not yet assigned')],
          ['Onboarding status', onboardingChip(hire.onboardingStatus)],
        ]);
      } else {
        $('profile-card-title').textContent = 'Profile details';
        $('profile-sub').textContent = `${hire.role} · ${hire.department}`;
        $('profile-kv-list').innerHTML = kvRows([
          ['Hire ID', esc(hire.id)],
          ...common,
          ['Hiring manager', orNotSet(hire.hiringManager, 'Unassigned')],
          ['Pipeline stage', `<span class="chip">${esc(STAGE_LABELS[hire.hireStage] || hire.hireStage)}</span>`],
          ['Onboarding status', onboardingChip(hire.onboardingStatus)],
        ]);
      }

      $('profile-edit-btn').hidden = !canMutate;
      $('profile-lifecycle-btn').hidden = !canMutate;
      $('profile-lifecycle-btn').textContent = hire.profileStatus === 'active' ? 'Deactivate profile' : 'Reactivate profile';
      $('profile-readonly-note').hidden = actor.role !== 'manager';
    }

    function renderDenied(reason) {
      $('profile-viewable-state').hidden = true;
      $('profile-denied-state').hidden = false;
      $('denied-title').textContent = 'Access denied';
      $('denied-reason').textContent = denialText(reason, tenant);
      $('denied-logged').textContent = `This attempt has been logged to ${tenant}'s audit trail. If you believe this is a mistake, contact your HR admin.`;
    }

    function setModal(name, open) {
      $(`${name}-overlay`).hidden = !open;
      $(`${name}-wrap`).hidden = !open;
    }

    // ---------- Edit modal ----------
    function openEdit() {
      EDIT_FIELDS.forEach((f) => {
        const el = $(f.input);
        if (f.key === 'hiringManager' && hire.hiringManager && !Array.from(el.options).some((o) => o.value === hire.hiringManager)) {
          el.add(new Option(hire.hiringManager, hire.hiringManager));
        }
        el.value = hire[f.key] || '';
        $(f.wrap).classList.remove('has-error');
        $(f.error).classList.remove('is-visible');
      });
      $('field-stage-readonly').textContent = STAGE_LABELS[hire.hireStage] || hire.hireStage;
      setModal('edit', true);
      $('field-name').focus();
    }

    function showFieldErrors(fields) {
      EDIT_FIELDS.forEach((f) => {
        const message = fields[f.key];
        $(f.wrap).classList.toggle('has-error', Boolean(message));
        $(f.error).classList.toggle('is-visible', Boolean(message));
        if (message) $(f.error).textContent = message;
      });
    }

    function saveEdit() {
      const changes = {};
      const missing = {};
      EDIT_FIELDS.forEach((f) => {
        changes[f.key] = $(f.input).value.trim();
        if (f.required && !changes[f.key]) missing[f.key] = $(f.error).textContent;
      });
      showFieldErrors(missing);
      if (Object.keys(missing).length > 0) return Promise.resolve();
      changes.hiringManager = changes.hiringManager || null;
      return api.update(hire.id, changes).then((updated) => {
        hire = updated;
        setModal('edit', false);
        renderViewable();
        showToast('Profile updated');
      }).catch((err) => {
        if (err && err.fields) showFieldErrors(err.fields);
        else showToast("Couldn't save changes. Try again.");
      });
    }

    // ---------- Deactivate / reactivate modal ----------
    function openConfirm() {
      const willDeactivate = hire.profileStatus === 'active';
      const label = willDeactivate ? 'Deactivate profile' : 'Reactivate profile';
      $('confirm-title').textContent = label;
      $('confirm-body').textContent = `${willDeactivate ? 'Deactivate' : 'Reactivate'} ${hire.name}'s profile?`;
      $('confirm-consequence-text').textContent = willDeactivate
        ? `Marking ${hire.name}'s profile as deactivated takes effect immediately. The record stays fully viewable to anyone with access — nothing is deleted.`
        : `Marking ${hire.name}'s profile as active takes effect immediately and is visible the moment this dialog closes.`;
      $('confirm-action-btn').textContent = label;
      $('confirm-action-btn').disabled = false;
      setModal('confirm', true);
    }

    function confirmLifecycle() {
      const deactivating = hire.profileStatus === 'active';
      $('confirm-action-btn').disabled = true;
      return (deactivating ? api.deactivate(hire.id) : api.reactivate(hire.id)).then((updated) => {
        hire = updated;
        setModal('confirm', false);
        renderViewable();
        showToast(deactivating ? 'Profile deactivated' : 'Profile reactivated');
      }).catch(() => {
        $('confirm-action-btn').disabled = false;
        showToast("Couldn't update the profile. Try again.");
      });
    }

    $('profile-edit-btn').onclick = openEdit;
    $('profile-lifecycle-btn').onclick = openConfirm;
    $('edit-save-btn').onclick = saveEdit;
    $('edit-cancel-btn').onclick = () => setModal('edit', false);
    $('edit-close-btn').onclick = () => setModal('edit', false);
    $('edit-form').onsubmit = (e) => { e.preventDefault(); saveEdit(); };
    $('confirm-action-btn').onclick = confirmLifecycle;
    $('confirm-cancel-btn').onclick = () => setModal('confirm', false);
    $('confirm-close-btn').onclick = () => setModal('confirm', false);

    if (result.allowed) renderViewable();
    else renderDenied(result.reason);
  }

  function createDefaultApi(getActor) {
    const call = (url, method, body) => HireActors.request(getActor(), url, method, body).then(HireActors.parseJson);
    return {
      get: (id) => HireActors.request(getActor(), `/hires/${encodeURIComponent(id)}`, 'GET').then((res) => res.json().catch(() => ({})).then((data) => (
        res.ok ? { allowed: true, hire: data } : { allowed: false, reason: data.reason || (res.status === 404 ? 'not_found' : 'unknown') }
      ))),
      update: (id, changes) => call(`/hires/${encodeURIComponent(id)}`, 'PATCH', changes),
      deactivate: (id) => call(`/hires/${encodeURIComponent(id)}/deactivate`, 'POST'),
      reactivate: (id) => call(`/hires/${encodeURIComponent(id)}/reactivate`, 'POST'),
    };
  }

  if (isNode) module.exports = { initHireAccessApp, createDefaultApi, denialText };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const id = new URLSearchParams(window.location.search).get('id');
      let getActor;
      const load = () => {
        const actor = getActor();
        const api = createDefaultApi(() => actor);
        api.get(id)
          .then((result) => initHireAccessApp(document, actor, result, api, () => { window.location.href = 'hire-directory.html'; }))
          .catch(() => initHireAccessApp(document, actor, { allowed: false, reason: 'unknown' }, api, () => { window.location.href = 'hire-directory.html'; }));
      };
      getActor = HireActors.setupActorSwitcher(document, load);
      load();
    });
  }
}());
