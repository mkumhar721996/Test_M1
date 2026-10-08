(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const SCREEN_BROWSE = 0;
  const SCREEN_FORM = 1;
  const SCREEN_CONFIRM = 2;
  const SCREEN_QUEUE = 3;
  const QUEUE_HASH = '#/admin/queue';
  const MAX_PHOTOS = 6;
  // No real sign-in exists yet; every request identifies as this customer (see my-requests.js).
  const DEMO_CUSTOMER_ID = 'cust-204';

  const FIELD_ERROR_KEYS = { categoryId: 'category', description: 'description', timeWindow: 'time-window', address: 'address' };
  const FIELD_LABELS = {
    category: 'Service category',
    description: "What's going on?",
    'time-window': 'Preferred time window',
    address: 'Service address',
  };
  const FIELD_FOCUS = { category: 'category-select', description: 'description', 'time-window': 'preferred-date', address: 'addr-street' };

  const UNSTAFFED_FORM_NOTICE = '<div class="notice"><span class="icon" aria-hidden="true">i</span>'
    + '<span><strong>No technician is currently available</strong> for this window. You can still submit — your request will be queued and assigned as soon as one opens up.</span></div>';
  const UNSTAFFED_CONFIRM_NOTICE = '<div class="notice"><span class="icon" aria-hidden="true">i</span>'
    + '<span><strong>Heads up:</strong> no technician is currently free for your requested window. Your request is still in the queue and will be assigned as soon as one opens up.</span></div>';

  function formatDate(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  function timeLabel(r) { return `${formatDate(r.preferredDate)}, ${r.timeWindowLabel}`; }

  function addressLabel(a) {
    return [a.street, a.unit, `${a.city}, ${String(a.state).toUpperCase()} ${a.zip}`].filter(Boolean).join(', ');
  }

  function initServicesApp(doc, api) {
    const win = doc.defaultView;
    const $ = (id) => doc.getElementById(id);
    const esc = (s) => escapeHtml(doc, s);
    const screens = Array.from(doc.querySelectorAll('.screen'));
    const categoryGrid = $('category-grid');
    const categorySelect = $('category-select');
    const timeWindowSelect = $('time-window');
    const dynamicFieldsEl = $('dynamic-fields');
    const unstaffedNotice = $('unstaffed-notice');
    const form = $('booking-form');
    const submitBtn = $('submit-btn');
    const submitStatus = $('submit-status');
    const errorSummaryEl = $('form-error-summary');
    const photoInput = $('photo-input');
    const photoGrid = $('photo-grid');
    const photoEmptyHint = $('photo-empty-hint');

    let categories = [];
    let timeWindows = [];
    let photos = [];
    let justAddedId = null;

    const categoryById = (id) => categories.find((c) => c.id === id);
    const windowById = (id) => timeWindows.find((w) => w.id === id);

    function show(index) {
      screens.forEach((s, i) => { s.style.display = i === index ? 'block' : 'none'; });
      const heading = screens[index].querySelector('h1');
      if (heading) heading.focus();
    }

    // ---------- Browse (AC1) ----------
    function renderCategories() {
      categoryGrid.innerHTML = categories.map((c) => (
        '<div class="card category-card">'
        + `<span class="cat-icon" aria-hidden="true">${esc(c.icon)}</span>`
        + `<h3 class="card-title" style="margin-bottom:0;">${esc(c.name)}</h3>`
        + `<p class="card-body">${esc(c.description)}</p>`
        + `<p class="cat-meta">${esc(c.duration)}</p>`
        + `<button type="button" class="btn btn-secondary" data-request-category="${esc(c.id)}">Request this service →</button>`
        + '</div>'
      )).join('');
      categoryGrid.querySelectorAll('[data-request-category]').forEach((btn) => {
        btn.addEventListener('click', () => goToBooking(btn.dataset.requestCategory));
      });
      categories.forEach((c) => {
        const opt = doc.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon} ${c.name}`;
        categorySelect.appendChild(opt);
      });
      timeWindows.forEach((w) => {
        const opt = doc.createElement('option');
        opt.value = w.id;
        opt.textContent = w.label;
        timeWindowSelect.appendChild(opt);
      });
    }

    // ---------- Field errors ----------
    const ERROR_INPUTS = {
      category: ['category-select'],
      description: ['description'],
      'time-window': ['preferred-date', 'time-window'],
      address: ['addr-street', 'addr-city', 'addr-state', 'addr-zip'],
    };

    function setFieldError(key, visible) {
      const errEl = $(`${key}-error`);
      if (errEl) errEl.hidden = !visible;
      (ERROR_INPUTS[key] || []).forEach((id) => {
        const el = $(id);
        el.classList.toggle('invalid', visible);
        el.setAttribute('aria-invalid', visible ? 'true' : 'false');
      });
    }

    function setDynFieldError(fieldId, visible) {
      const input = $(`dyn-${fieldId}`);
      const errEl = $(`dyn-${fieldId}-error`);
      if (input) {
        input.classList.toggle('invalid', visible);
        input.setAttribute('aria-invalid', visible ? 'true' : 'false');
      }
      if (errEl) errEl.hidden = !visible;
    }

    function resetErrors() {
      errorSummaryEl.innerHTML = '';
      doc.querySelectorAll('#booking-form .field-error').forEach((el) => { el.hidden = true; });
      doc.querySelectorAll('#booking-form .input').forEach((el) => {
        el.classList.remove('invalid');
        el.removeAttribute('aria-invalid');
      });
    }

    // ---------- Dynamic fields (AC2) ----------
    function renderDynamicFields(categoryId) {
      const category = categoryById(categoryId);
      if (!category) {
        dynamicFieldsEl.innerHTML = '<p class="hint" style="margin:0;">Choose a service category above to see the questions for your job.</p>';
        return;
      }
      dynamicFieldsEl.innerHTML = category.fields.map((f) => {
        const mark = f.optional ? '<span class="optional-tag">(optional)</span>' : '<span class="required-mark">*</span>';
        const attrs = `id="dyn-${esc(f.id)}" data-dyn-field="${esc(f.id)}" aria-describedby="dyn-${esc(f.id)}-error"`;
        const control = f.type === 'select'
          ? `<select class="input" ${attrs}><option value="">Choose…</option>${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`
          : `<input class="input" type="text" ${attrs} placeholder="${esc(f.placeholder || '')}" />`;
        return '<div class="form-row"><div>'
          + `<label class="label" for="dyn-${esc(f.id)}">${esc(f.label)} ${mark}</label>`
          + control
          + `<p class="field-error" id="dyn-${esc(f.id)}-error" hidden><span class="icon" aria-hidden="true">!</span> ${esc(f.label)} is required.</p>`
          + '</div></div>';
      }).join('');
      category.fields.forEach((f) => {
        $(`dyn-${f.id}`).addEventListener(f.type === 'select' ? 'change' : 'input', () => setDynFieldError(f.id, false));
      });
    }

    categorySelect.addEventListener('change', () => {
      renderDynamicFields(categorySelect.value);
      setFieldError('category', false);
    });

    // ---------- Unstaffed notice (AC7: informational, never an error) ----------
    function updateUnstaffedNotice() {
      const w = windowById(timeWindowSelect.value);
      const unstaffed = Boolean(w) && !w.staffed;
      unstaffedNotice.innerHTML = unstaffed ? UNSTAFFED_FORM_NOTICE : '';
    }

    timeWindowSelect.addEventListener('change', () => { updateUnstaffedNotice(); setFieldError('time-window', false); });
    $('preferred-date').addEventListener('input', () => setFieldError('time-window', false));
    $('description').addEventListener('input', () => setFieldError('description', false));
    ['addr-street', 'addr-city', 'addr-state', 'addr-zip'].forEach((id) => {
      $(id).addEventListener('input', () => setFieldError('address', false));
    });

    // ---------- Photos (optional) ----------
    function renderPhotos() {
      photoEmptyHint.hidden = photos.length > 0;
      const addBtn = photos.length < MAX_PHOTOS
        ? '<button type="button" class="photo-add-btn" id="photo-add-btn"><span class="icon" aria-hidden="true">+</span>Add photo</button>'
        : '';
      photoGrid.innerHTML = photos.map((p, i) => (
        '<div class="photo-thumb">'
        + (p.url ? `<img src="${esc(p.url)}" alt="Attached photo ${i + 1}: ${esc(p.name)}" />` : '')
        + `<button type="button" class="photo-remove" data-remove-index="${i}" aria-label="Remove photo ${i + 1}">✕</button>`
        + '</div>'
      )).join('') + addBtn;
      const add = $('photo-add-btn');
      if (add) add.addEventListener('click', () => photoInput.click());
      photoGrid.querySelectorAll('[data-remove-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.removeIndex);
          const [removed] = photos.splice(index, 1);
          if (removed.url && win.URL.revokeObjectURL) win.URL.revokeObjectURL(removed.url);
          renderPhotos();
          const nextFocusIndex = Math.min(index, photos.length - 1);
          const nextBtn = nextFocusIndex >= 0
            ? photoGrid.querySelector(`[data-remove-index="${nextFocusIndex}"]`)
            : null;
          (nextBtn || $('photo-add-btn')).focus();
        });
      });
    }

    function clearPhotos() {
      photos.forEach((p) => { if (p.url && win.URL.revokeObjectURL) win.URL.revokeObjectURL(p.url); });
      photos = [];
      renderPhotos();
    }

    photoInput.addEventListener('change', () => {
      Array.from(photoInput.files || []).slice(0, MAX_PHOTOS - photos.length).forEach((file) => {
        photos.push({ name: file.name, url: win.URL.createObjectURL ? win.URL.createObjectURL(file) : '' });
      });
      photoInput.value = '';
      renderPhotos();
    });

    // ---------- Validation (AC4) ----------
    function validateForm() {
      const missing = [];
      const categoryId = categorySelect.value;
      setFieldError('category', !categoryId);
      if (!categoryId) missing.push({ label: FIELD_LABELS.category, focusId: FIELD_FOCUS.category });

      const category = categoryById(categoryId);
      if (category) {
        category.fields.forEach((f) => {
          const empty = !f.optional && !$(`dyn-${f.id}`).value.trim();
          setDynFieldError(f.id, empty);
          if (empty) missing.push({ label: f.label, focusId: `dyn-${f.id}` });
        });
      }

      const description = $('description').value.trim();
      setFieldError('description', !description);
      if (!description) missing.push({ label: FIELD_LABELS.description, focusId: 'description' });

      const date = $('preferred-date').value;
      const timeMissing = !date || !timeWindowSelect.value;
      setFieldError('time-window', timeMissing);
      if (timeMissing) missing.push({ label: FIELD_LABELS['time-window'], focusId: date ? 'time-window' : 'preferred-date' });

      const addrIds = ['addr-street', 'addr-city', 'addr-state', 'addr-zip'];
      const firstEmpty = addrIds.find((id) => !$(id).value.trim());
      setFieldError('address', Boolean(firstEmpty));
      if (firstEmpty) missing.push({ label: FIELD_LABELS.address, focusId: firstEmpty });
      return missing;
    }

    function renderErrorSummary(missing) {
      if (missing.length === 0) { errorSummaryEl.innerHTML = ''; return; }
      errorSummaryEl.innerHTML = '<div class="state-banner" role="alert">'
        + '<span class="icon" aria-hidden="true">!</span>'
        + '<div><p style="margin:0;font-weight:700;">We couldn\'t submit your request — please fix the following:</p>'
        + `<ul>${missing.map((m) => `<li><button type="button" class="link-btn" data-jump-to="${esc(m.focusId)}">${esc(m.label)}</button></li>`).join('')}</ul>`
        + '</div></div>';
      errorSummaryEl.querySelectorAll('[data-jump-to]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const el = $(btn.dataset.jumpTo);
          if (el) el.focus();
        });
      });
      errorSummaryEl.focus();
    }

    // ---------- Submit (AC3, AC5, AC7) ----------
    function collectPayload() {
      const categoryDetails = {};
      doc.querySelectorAll('[data-dyn-field]').forEach((el) => {
        if (el.value.trim()) categoryDetails[el.dataset.dynField] = el.value.trim();
      });
      return {
        categoryId: categorySelect.value,
        categoryDetails,
        description: $('description').value.trim(),
        preferredDate: $('preferred-date').value,
        timeWindowId: timeWindowSelect.value,
        address: {
          street: $('addr-street').value.trim(),
          unit: $('addr-unit').value.trim(),
          city: $('addr-city').value.trim(),
          state: $('addr-state').value.trim(),
          zip: $('addr-zip').value.trim(),
        },
        photos: photos.map((p) => ({ name: p.name })),
      };
    }

    function renderConfirmation(r) {
      $('conf-id').textContent = r.id;
      $('conf-category').textContent = r.categoryName;
      $('conf-time').textContent = timeLabel(r);
      $('conf-address').textContent = addressLabel(r.address);
      $('conf-description').textContent = r.description;
      $('conf-photos').textContent = r.photoCount > 0
        ? `${r.photoCount} photo${r.photoCount === 1 ? '' : 's'} attached`
        : 'No photos attached';
      $('conf-unstaffed-notice').innerHTML = r.staffed === false ? UNSTAFFED_CONFIRM_NOTICE : '';
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const missing = validateForm();
      renderErrorSummary(missing);
      if (missing.length > 0) {
        submitStatus.textContent = '';
        return Promise.resolve();
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      submitStatus.textContent = '';
      return api.createRequest(collectPayload()).then((record) => {
        justAddedId = record.id;
        renderConfirmation(record);
        show(SCREEN_CONFIRM);
      }).catch((err) => {
        const keys = Object.keys((err && err.fields) || {}).map((k) => FIELD_ERROR_KEYS[k]).filter(Boolean);
        if (keys.length > 0) {
          keys.forEach((k) => setFieldError(k, true));
          renderErrorSummary(keys.map((k) => ({ label: FIELD_LABELS[k], focusId: FIELD_FOCUS[k] })));
        } else {
          submitStatus.textContent = "We couldn't submit your request. Please try again.";
        }
      }).then(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
      });
    });

    // ---------- Admin dispatch queue (AC6, AC7) ----------
    function renderQueue(items) {
      $('queue-empty').hidden = items.length > 0;
      $('queue-list').innerHTML = items.map((r) => {
        const category = categoryById(r.categoryId);
        return `<div class="queue-row${r.id === justAddedId ? ' just-added' : ''}" data-id="${esc(r.id)}">`
          + '<div class="queue-row-main">'
          + `<span class="queue-row-title">${category ? `${esc(category.icon)} ` : ''}${esc(r.categoryName)}</span>`
          + `<span class="queue-row-meta">${esc(r.id)} · submitted ${esc(formatDateTime(r.submittedAt))}</span>`
          + `<span class="queue-row-sub">${esc(addressLabel(r.address))}</span>`
          + '</div><div class="queue-row-right">'
          + `<span class="status-chip"><span aria-hidden="true">●</span> ${esc(r.status)}</span>`
          + `<span class="queue-row-sub">${esc(timeLabel(r))}</span>`
          + (r.staffed ? '' : '<span class="unstaffed-badge"><span aria-hidden="true">i</span> No technician available yet</span>')
          + '</div></div>';
      }).join('');
    }

    function showQueue() {
      show(SCREEN_QUEUE);
      return api.listQueue().then(renderQueue).catch((err) => {
        renderQueue([]);
        const denied = err && (err.status === 401 || err.status === 403);
        $('queue-empty').querySelector('p').textContent = denied
          ? 'You need a dispatcher account to view the dispatch queue.'
          : "We couldn't load the dispatch queue. Please try again.";
      });
    }

    // ---------- Navigation ----------
    function goToBooking(categoryId) {
      form.reset();
      clearPhotos();
      resetErrors();
      categorySelect.value = categoryId || '';
      renderDynamicFields(categoryId || '');
      updateUnstaffedNotice();
      show(SCREEN_FORM);
    }

    ['back-to-browse', 'back-to-browse-2', 'back-to-browse-3'].forEach((id) => {
      $(id).addEventListener('click', (e) => {
        e.preventDefault();
        if (win.location.hash === QUEUE_HASH) win.location.hash = '';
        show(SCREEN_BROWSE);
      });
    });
    $('submit-another').addEventListener('click', () => goToBooking(''));

    function onHashChange() {
      if (win.location.hash === QUEUE_HASH) showQueue();
    }
    win.addEventListener('hashchange', onHashChange);

    renderDynamicFields('');
    renderPhotos();
    show(SCREEN_BROWSE);
    const loaded = api.getCatalog().then((catalog) => {
      categories = catalog.categories;
      timeWindows = catalog.timeWindows;
      renderCategories();
    });
    if (win.location.hash === QUEUE_HASH) return loaded.then(showQueue);
    return loaded;
  }

  function createDefaultApi() {
    function request(url, method, body, extraHeaders) {
      const opts = { method, headers: { 'Content-Type': 'application/json', ...extraHeaders } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts)
        .then((res) => res.json().catch(() => ({})).then((data) => (
          res.ok ? data : Promise.reject({ status: res.status, ...data })
        )));
    }

    return {
      getCatalog: () => request('/service-catalog', 'GET'),
      createRequest: (payload) => request('/repair-requests', 'POST', payload, { 'x-user-id': DEMO_CUSTOMER_ID }),
      // Deliberately does NOT send an 'x-staff-role' header: whatever value this public client
      // bundle asserted would be readable by anyone, so it would be a cosmetic, bypassable gate
      // on an endpoint that returns real customer PII (see src/repairRequests/auth.js). Until a
      // server-verified dispatcher credential exists, the shipped queue screen shows the "need a
      // dispatcher account" message; a developer/reviewer can still inspect the route directly
      // (e.g. curl -H 'x-staff-role: dispatcher') outside production.
      listQueue: () => request('/repair-requests', 'GET'),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initServicesApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initServicesApp(document, createDefaultApi());
    });
  }
}());
