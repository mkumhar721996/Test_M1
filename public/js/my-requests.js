(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const SCREEN_LIST = 0;
  const SCREEN_DETAIL = 1;
  const SCREEN_EDIT = 2;
  // No real sign-in exists yet; every request identifies as this customer (see services.js).
  const DEMO_CUSTOMER_ID = 'cust-204';
  const DETAIL_HASH = /^#\/requests\/([^/]+)$/;
  const EDIT_HASH = /^#\/requests\/([^/]+)\/edit$/;

  // The stored status for a just-submitted request is 'Pending'; customers know it as "Submitted".
  const STATUS_META = {
    Pending: { label: 'Submitted', icon: '○', className: 'status-submitted' },
    Assigned: { label: 'Assigned', icon: '✓', className: 'status-assigned' },
    Cancelled: { label: 'Cancelled', icon: '✕', className: 'status-cancelled' },
  };
  const CATEGORIES = [
    { id: 'plumbing', name: 'Plumbing', icon: '🚰' },
    { id: 'electrical', name: 'Electrical', icon: '💡' },
    { id: 'hvac', name: 'Heating & cooling', icon: '🌡️' },
    { id: 'appliance', name: 'Appliance repair', icon: '🧺' },
    { id: 'handyman', name: 'General handyman', icon: '🛠️' },
  ];
  const TIME_WINDOWS = [
    { id: 'morning', label: 'Morning (8am–11am)' },
    { id: 'midday', label: 'Midday (11am–2pm)' },
    { id: 'afternoon', label: 'Afternoon (2pm–5pm)' },
    { id: 'evening', label: 'Evening (5pm–8pm)' },
  ];
  const ACTION_VERBS = { edit: 'update', cancel: 'cancel' };

  const categoryIcon = (id) => (CATEGORIES.find((c) => c.id === id) || {}).icon || '🛠️';
  const isPending = (r) => r.status === 'Pending';

  function formatShortDate(dateStr) {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatDateTime(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  function addressLine(r) {
    const a = r.address || {};
    return [a.street, a.unit, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ');
  }
  function timeLabel(r) {
    return `${formatShortDate(r.preferredDate)}, ${r.timeWindowLabel}`;
  }

  function createDefaultApi() {
    function request(url, method, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json', 'x-user-id': DEMO_CUSTOMER_ID } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts).then((res) => res.json().catch(() => ({})).then((data) => (
        res.ok ? data : Promise.reject({ status: res.status, ...data })
      )));
    }
    const one = (id) => `/repair-requests/${encodeURIComponent(id)}`;
    return {
      listMine: () => request('/repair-requests/mine', 'GET'),
      get: (id) => request(one(id), 'GET'),
      update: (id, payload) => request(one(id), 'PATCH', payload),
      cancel: (id) => request(`${one(id)}/cancel`, 'POST'),
    };
  }

  function initMyRequestsApp(doc, api) {
    const win = doc.defaultView;
    const $ = (id) => doc.getElementById(id);
    const esc = (v) => escapeHtml(doc, v);
    const screens = Array.from(doc.querySelectorAll('.screen'));

    let requests = [];
    let current = null;
    let toastTimer = null;
    let cancelTargetId = null;
    let cancelModalTrigger = null;
    let keepBanner = false;

    function show(index) {
      screens.forEach((s, i) => { s.style.display = i === index ? 'block' : 'none'; });
    }

    function showToast(message) {
      const toast = $('toast');
      toast.textContent = message;
      toast.hidden = false;
      win.clearTimeout(toastTimer);
      toastTimer = win.setTimeout(() => { toast.hidden = true; }, 3200);
    }

    function statusChipHTML(status) {
      const meta = STATUS_META[status] || { label: status, icon: '○', className: 'status-submitted' };
      return `<span class="status-chip ${meta.className}"><span aria-hidden="true">${meta.icon}</span>${esc(meta.label)}</span>`;
    }

    // ---------- List ----------
    const listEls = ['list-loading', 'list-error', 'request-list-empty', 'request-list'].map($);
    function setListState(next) {
      listEls.forEach((el) => { el.hidden = true; });
      $('request-count').textContent = '';
      const target = { loading: 'list-loading', error: 'list-error', empty: 'request-list-empty', success: 'request-list' }[next];
      $(target).hidden = false;
    }

    function requestCardHTML(r) {
      const pending = isPending(r);
      const actions = pending
        ? `<button type="button" class="btn btn-secondary" data-view="${esc(r.id)}">View details</button>`
          + `<button type="button" class="btn btn-secondary" data-edit="${esc(r.id)}">Edit</button>`
          + `<button type="button" class="btn btn-secondary" data-cancel="${esc(r.id)}">Cancel request</button>`
        : `<button type="button" class="btn btn-secondary" data-view="${esc(r.id)}">View details</button>`;
      return `<div class="card request-card${r.status === 'Cancelled' ? ' is-cancelled' : ''}" data-request-card="${esc(r.id)}">`
        + '<div class="request-card-head">'
        + `<div><p class="request-card-title">${categoryIcon(r.categoryId)} ${esc(r.categoryName)}</p>`
        + `<p class="request-submitted-line">Submitted ${formatShortDate(String(r.submittedAt).slice(0, 10))}</p></div>`
        + `${statusChipHTML(r.status)}</div>`
        + `<p class="request-meta">${esc(timeLabel(r))} · ${esc(addressLine(r))}</p>`
        + `<p class="request-description">${esc(r.description)}</p>`
        + `<div class="request-actions">${actions}</div></div>`;
    }

    function renderRequestList() {
      const list = $('request-list');
      list.innerHTML = requests.map(requestCardHTML).join('');
      list.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { win.location.hash = `#/requests/${b.dataset.view}`; }));
      list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { win.location.hash = `#/requests/${b.dataset.edit}/edit`; }));
      list.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => openCancelModal(b.dataset.cancel)));
      $('request-count').textContent = `${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`;
    }

    function loadList() {
      setListState('loading');
      return api.listMine().then((data) => {
        requests = data;
        if (requests.length === 0) {
          setListState('empty');
          $('request-count').textContent = '0 requests';
          return;
        }
        setListState('success');
        renderRequestList();
        $('list-live-region').textContent = 'Requests loaded.';
      }).catch(() => setListState('error'));
    }

    function upsert(record) {
      const i = requests.findIndex((r) => r.id === record.id);
      if (i >= 0) requests[i] = record;
      else requests.unshift(record);
      current = record;
      if (!$('request-list').hidden) renderRequestList();
    }

    // ---------- Detail ----------
    function showRejectionBanner(action) {
      $('detail-rejection-banner').innerHTML = '<div class="state-banner" role="alert">'
        + '<span class="icon" aria-hidden="true">!</span>'
        + `<div><strong>Can't ${ACTION_VERBS[action]} this request.</strong> A technician has already been assigned, so changes now go through support.</div></div>`;
    }

    function renderDetail() {
      const r = current;
      $('detail-denied').hidden = Boolean(r);
      $('detail-content').hidden = !r;
      if (!r) return;
      $('detail-category').textContent = `${categoryIcon(r.categoryId)} ${r.categoryName}`;
      $('detail-status-chip').innerHTML = statusChipHTML(r.status);
      $('detail-id').textContent = r.id;
      $('detail-submitted').textContent = formatDateTime(r.submittedAt);
      $('detail-time').textContent = timeLabel(r);
      $('detail-address').textContent = addressLine(r);
      $('detail-description').textContent = r.description;
      const notice = (text) => `<div class="notice"><span class="icon" aria-hidden="true">i</span><span>${text}</span></div>`;
      $('detail-locked-notice').innerHTML = r.status === 'Assigned'
        ? notice(`<strong>${esc(r.technicianName || 'A technician')}</strong> has been assigned to this request, so it can no longer be edited or cancelled here. Contact support if you need to make a change.`)
        : '';
      $('detail-cancelled-notice').innerHTML = r.status === 'Cancelled'
        ? notice(`This request was cancelled on ${esc(formatDateTime(r.cancelledAt))}. Submit a new request if you still need service.`)
        : '';
      const actions = $('detail-actions');
      actions.innerHTML = isPending(r)
        ? `<button type="button" class="btn btn-primary" data-edit="${esc(r.id)}">Edit</button>`
          + `<button type="button" class="btn btn-secondary" data-cancel="${esc(r.id)}">Cancel request</button>`
        : '';
      const edit = actions.querySelector('[data-edit]');
      if (edit) edit.addEventListener('click', () => { win.location.hash = `#/requests/${r.id}/edit`; });
      const cancel = actions.querySelector('[data-cancel]');
      if (cancel) cancel.addEventListener('click', () => openCancelModal(r.id));
    }

    function openDetail(id) {
      if (!keepBanner) $('detail-rejection-banner').innerHTML = '';
      keepBanner = false;
      current = requests.find((r) => r.id === id) || null;
      if (current) {
        renderDetail();
        show(SCREEN_DETAIL);
        return Promise.resolve();
      }
      return api.get(id).then((record) => {
        current = record;
        renderDetail();
        show(SCREEN_DETAIL);
      }).catch((err) => {
        if (err && err.status === 404) {
          current = null;
          renderDetail();
          show(SCREEN_DETAIL);
          return;
        }
        showToast("Couldn't load this request. Try again.");
        show(SCREEN_LIST);
      });
    }

    // A 409 means the request was assigned after this page loaded: re-fetch and render it locked.
    function handleRejection(err, id, action) {
      if (!err || err.status !== 409) return Promise.reject(err);
      return api.get(id).then((record) => {
        upsert(record);
        showRejectionBanner(action);
        renderDetail();
        const target = `#/requests/${id}`;
        keepBanner = win.location.hash !== target;
        win.location.hash = target;
        show(SCREEN_DETAIL);
      });
    }

    // ---------- Cancel modal ----------
    function openCancelModal(id) {
      const r = requests.find((x) => x.id === id) || current;
      if (!r) return;
      cancelTargetId = id;
      cancelModalTrigger = doc.activeElement;
      $('cancel-modal-summary').textContent = `${r.categoryName} request for ${timeLabel(r)} at ${addressLine(r)}.`;
      $('cancel-modal-overlay').hidden = false;
      $('cancel-modal-wrap').hidden = false;
      $('cancel-modal-keep').focus();
    }
    function closeCancelModal() {
      $('cancel-modal-overlay').hidden = true;
      $('cancel-modal-wrap').hidden = true;
      if (cancelModalTrigger) cancelModalTrigger.focus();
    }
    $('cancel-modal-close').addEventListener('click', closeCancelModal);
    $('cancel-modal-keep').addEventListener('click', closeCancelModal);
    $('cancel-modal-overlay').addEventListener('click', closeCancelModal);
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('cancel-modal-wrap').hidden) closeCancelModal();
    });
    $('cancel-modal-confirm').addEventListener('click', () => {
      const id = cancelTargetId;
      closeCancelModal();
      return api.cancel(id)
        .then((record) => {
          upsert(record);
          showToast('Request cancelled.');
          if (current && current.id === id && !$('detail-content').hidden) renderDetail();
        })
        .catch((err) => handleRejection(err, id, 'cancel'))
        .catch(() => showToast("Couldn't cancel the request. Try again."));
    });

    // ---------- Edit ----------
    const categorySelect = $('edit-category');
    const windowSelect = $('edit-window');
    CATEGORIES.forEach((c) => categorySelect.appendChild(new win.Option(`${c.icon} ${c.name}`, c.id)));
    TIME_WINDOWS.forEach((w) => windowSelect.appendChild(new win.Option(w.label, w.id)));

    const FIELD_INPUTS = {
      description: ['edit-description'],
      time: ['edit-date', 'edit-window'],
      address: ['edit-addr-street', 'edit-addr-city', 'edit-addr-state', 'edit-addr-zip'],
    };
    function setEditFieldError(key, on) {
      $(`edit-${key}-error`).hidden = !on;
      FIELD_INPUTS[key].forEach((id) => {
        $(id).classList.toggle('invalid', on);
        $(id).setAttribute('aria-invalid', on ? 'true' : 'false');
      });
    }
    Object.keys(FIELD_INPUTS).forEach((key) => FIELD_INPUTS[key].forEach((id) => (
      $(id).addEventListener('input', () => setEditFieldError(key, false))
    )));

    function openEdit(record) {
      current = record;
      $('edit-request-id').textContent = record.id;
      categorySelect.value = record.categoryId;
      $('edit-description').value = record.description;
      $('edit-date').value = record.preferredDate;
      windowSelect.value = record.timeWindowId;
      $('edit-addr-street').value = record.address.street;
      $('edit-addr-unit').value = record.address.unit;
      $('edit-addr-city').value = record.address.city;
      $('edit-addr-state').value = record.address.state;
      $('edit-addr-zip').value = record.address.zip;
      $('edit-error-summary').innerHTML = '';
      Object.keys(FIELD_INPUTS).forEach((key) => setEditFieldError(key, false));
      show(SCREEN_EDIT);
    }

    function validateEditForm() {
      const missing = [];
      const value = (id) => $(id).value.trim();
      const descriptionMissing = !value('edit-description');
      setEditFieldError('description', descriptionMissing);
      if (descriptionMissing) missing.push({ label: "What's going on?", focusId: 'edit-description' });
      const timeMissing = !$('edit-date').value || !windowSelect.value;
      setEditFieldError('time', timeMissing);
      if (timeMissing) missing.push({ label: 'Preferred time window', focusId: $('edit-date').value ? 'edit-window' : 'edit-date' });
      const firstBlank = ['edit-addr-street', 'edit-addr-city', 'edit-addr-state', 'edit-addr-zip'].find((id) => !value(id));
      setEditFieldError('address', Boolean(firstBlank));
      if (firstBlank) missing.push({ label: 'Service address', focusId: firstBlank });
      return missing;
    }

    function renderEditErrorSummary(missing) {
      const summary = $('edit-error-summary');
      if (missing.length === 0) { summary.innerHTML = ''; return; }
      summary.innerHTML = '<div class="state-banner" role="alert"><span class="icon" aria-hidden="true">!</span>'
        + '<div><p style="margin:0;font-weight:700;">We couldn\'t save your changes — please fix the following:</p>'
        + `<ul style="margin:var(--space-2) 0 0 0;padding-left:1.1em;">${missing.map((m) => `<li><button type="button" class="link-btn" data-jump-to="${m.focusId}">${esc(m.label)}</button></li>`).join('')}</ul></div></div>`;
      summary.querySelectorAll('[data-jump-to]').forEach((btn) => btn.addEventListener('click', () => $(btn.dataset.jumpTo).focus()));
      summary.focus();
    }

    function editPayload() {
      const value = (id) => $(id).value.trim();
      return {
        categoryId: categorySelect.value,
        description: value('edit-description'),
        preferredDate: $('edit-date').value,
        timeWindowId: windowSelect.value,
        address: {
          street: value('edit-addr-street'),
          unit: value('edit-addr-unit'),
          city: value('edit-addr-city'),
          state: value('edit-addr-state').toUpperCase(),
          zip: value('edit-addr-zip'),
        },
      };
    }

    const submitBtn = $('edit-submit-btn');
    $('edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const missing = validateEditForm();
      renderEditErrorSummary(missing);
      if (missing.length > 0) return undefined;
      const id = current.id;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      return api.update(id, editPayload())
        .then((record) => {
          upsert(record);
          showToast('Request updated.');
          win.location.hash = `#/requests/${id}`;
          renderDetail();
          show(SCREEN_DETAIL);
        })
        .catch((err) => handleRejection(err, id, 'edit'))
        .catch(() => { $('edit-submit-status').textContent = "Couldn't save your changes. Try again."; })
        .then(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save changes';
        });
    });

    const goDetail = () => { win.location.hash = `#/requests/${current.id}`; };
    const goList = () => { win.location.hash = ''; };
    $('edit-discard-btn').addEventListener('click', goDetail);
    $('back-to-detail').addEventListener('click', (e) => { e.preventDefault(); goDetail(); });
    $('back-to-list').addEventListener('click', (e) => { e.preventDefault(); goList(); });
    $('denied-back-btn').addEventListener('click', goList);
    $('list-retry').addEventListener('click', loadList);

    // ---------- Routing ----------
    function route() {
      const hash = win.location.hash;
      const edit = EDIT_HASH.exec(hash);
      if (edit) {
        const id = decodeURIComponent(edit[1]);
        const known = requests.find((r) => r.id === id);
        // Anything that isn't an openable Pending request falls through to the detail screen,
        // which handles the missing / locked / cancelled states (and load failures) itself.
        return (known ? Promise.resolve(known) : api.get(id).catch(() => null)).then((record) => {
          if (record && isPending(record)) openEdit(record);
          else openDetail(id);
        });
      }
      const detail = DETAIL_HASH.exec(hash);
      if (detail) return openDetail(decodeURIComponent(detail[1]));
      show(SCREEN_LIST);
      return Promise.resolve();
    }
    win.addEventListener('hashchange', route);

    show(SCREEN_LIST);
    return loadList().then(route);
  }

  if (typeof module !== 'undefined') module.exports = { initMyRequestsApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initMyRequestsApp(document, createDefaultApi());
    });
  }
}());
