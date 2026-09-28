const STAFF_NAME = 'Jordan Blake';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function money(n) {
  return `$${Number(n).toFixed(0)}`;
}

function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function formatDate(dateStr) {
  return parseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatDateRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function rangesOverlap(s1, e1, s2, e2) {
  return parseDate(s1) <= parseDate(e2) && parseDate(s2) <= parseDate(e1);
}

function dateInRange(dateStr, start, end) {
  const d = parseDate(dateStr);
  return d >= parseDate(start) && d <= parseDate(end);
}

function initRatePlansApp(doc, initialRoomTypes, initialPlans, api) {
  const roomTypes = initialRoomTypes.slice();
  let plans = initialPlans.slice();
  let editingPlanId = null;
  let pendingDeleteId = null;
  let toastTimer = null;

  function $(id) { return doc.getElementById(id); }
  function roomTypeById(id) { return roomTypes.find((rt) => rt.id === id); }
  function roomTypeName(id) { const rt = roomTypeById(id); return rt ? rt.name : id; }
  function planById(id) { return plans.find((p) => p.id === id); }
  function planName(id) { const p = planById(id); return p ? p.name : id; }

  const screens = {
    list: $('rate-plans-screen'),
    editor: $('editor-screen'),
    lookup: $('lookup-screen'),
  };

  function showScreen(name) {
    Object.keys(screens).forEach((key) => { screens[key].hidden = key !== name; });
  }

  Array.from(doc.querySelectorAll('[data-goto]')).forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen(link.getAttribute('data-goto'));
    });
  });

  function showToast(message) {
    const toast = $('toast');
    $('toast-message').textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  /* ---------------- Base rates panel ---------------- */
  function renderBaseRates() {
    $('base-rates-list').innerHTML = roomTypes.map((rt) => (
      `<div class="rate-row"><span class="rt-name">${escapeHtml(rt.name)}</span><span class="rt-price">${money(rt.baseRate)}/night</span></div>`
    )).join('');
  }

  /* ---------------- Rate plan list (AC1, AC3, AC4, AC7) ---------------- */
  function findOverlapConflicts(plan) {
    const conflicts = [];
    plans.forEach((other) => {
      if (other.id === plan.id) return;
      if (!rangesOverlap(plan.startDate, plan.endDate, other.startDate, other.endDate)) return;
      const shared = Object.keys(plan.prices).filter((rt) => other.prices[rt] !== undefined);
      if (shared.length) conflicts.push({ plan: other, roomTypes: shared });
    });
    return conflicts;
  }

  function renderList() {
    const grid = $('rp-grid');
    const empty = $('rp-empty');
    if (plans.length === 0) {
      empty.hidden = false;
      grid.hidden = true;
      grid.innerHTML = '';
      return;
    }
    empty.hidden = true;
    grid.hidden = false;

    grid.innerHTML = plans.map((plan) => {
      const conflicts = findOverlapConflicts(plan);
      const chips = Object.keys(plan.prices).map((rtId) => (
        `<span class="chip">${escapeHtml(roomTypeName(rtId))} · ${money(plan.prices[rtId])}/night</span>`
      )).join('');

      const overlapHtml = conflicts.map((c) => {
        const winnerIsThis = new Date(plan.createdAt) >= new Date(c.plan.createdAt);
        const winnerName = winnerIsThis ? plan.name : c.plan.name;
        const roomTypeNames = c.roomTypes.map(roomTypeName).join(', ');
        return `<div class="rp-overlap-note"><span class="icon" aria-hidden="true">⚠️</span>` +
          `<p><strong>Overlaps</strong> with “${escapeHtml(c.plan.name)}” for ${escapeHtml(roomTypeNames)}. ` +
          `Rule: most recently created plan wins — <strong>${escapeHtml(winnerName)}</strong> applies on the shared dates.</p></div>`;
      }).join('');

      return `<div class="card rp-card" role="listitem" data-plan-id="${plan.id}">` +
        '<div class="rp-card-head">' +
          `<h3 class="card-title">${escapeHtml(plan.name)}</h3>` +
          '<div class="rp-card-actions">' +
            `<button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-id="${plan.id}">Edit</button>` +
            `<button class="btn btn-danger btn-sm" type="button" data-action="delete" data-id="${plan.id}">Delete</button>` +
          '</div>' +
        '</div>' +
        `<p class="u-text-sm u-text-muted rp-daterange">${formatDateRange(plan.startDate, plan.endDate)}</p>` +
        '<span class="rp-meta-label u-text-sm u-text-muted">Room types priced on this plan:</span>' +
        `<div class="rp-price-chips">${chips}</div>` +
        overlapHtml +
        '</div>';
    }).join('');
  }

  $('rp-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-action') === 'edit') {
      openEditor(id);
      showScreen('editor');
    } else if (btn.getAttribute('data-action') === 'delete') {
      askDelete(id);
    }
  });

  $('new-plan-btn').addEventListener('click', () => { openEditor(null); showScreen('editor'); });
  $('add-first-plan-btn').addEventListener('click', () => { openEditor(null); showScreen('editor'); });

  /* ---------------- Delete confirm modal ---------------- */
  function askDelete(id) {
    pendingDeleteId = id;
    const plan = planById(id);
    if (!plan) return;
    const roomTypeNames = Object.keys(plan.prices).map(roomTypeName).join(', ');
    $('delete-modal-body').textContent = `“${plan.name}” (${formatDateRange(plan.startDate, plan.endDate)}) will be removed. Future price lookups for ${roomTypeNames} during this range will fall back to another overlapping plan or the base rate.`;
    $('delete-overlay').hidden = false;
    $('delete-modal-wrap').hidden = false;
    $('confirm-delete-btn').focus();
  }

  function closeDeleteModal() {
    $('delete-overlay').hidden = true;
    $('delete-modal-wrap').hidden = true;
    pendingDeleteId = null;
  }

  $('delete-modal-close-btn').addEventListener('click', closeDeleteModal);
  $('cancel-delete-btn').addEventListener('click', closeDeleteModal);

  $('confirm-delete-btn').addEventListener('click', () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const plan = planById(id);
    api.remove(id).then(() => {
      plans = plans.filter((p) => p.id !== id);
      closeDeleteModal();
      renderList();
      populateEditPicker();
      showToast(`“${plan.name}” deleted.`);
    }).catch(() => {
      closeDeleteModal();
      showToast('Rate plan could not be deleted — please try again');
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('delete-modal-wrap').hidden) closeDeleteModal();
  });

  /* ---------------- Editor (AC1, AC2, AC3, AC5, AC6) ---------------- */
  function populateEditPicker() {
    const sel = $('edit-picker-field');
    if (!plans.length) {
      sel.innerHTML = '<option value="">No rate plans to edit</option>';
      return;
    }
    sel.innerHTML = plans.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }

  function roomTypeOptionsHtml(selectedId) {
    return roomTypes.map((rt) => (
      `<option value="${rt.id}"${rt.id === selectedId ? ' selected' : ''}>${escapeHtml(rt.name)} (base ${money(rt.baseRate)}/night)</option>`
    )).join('');
  }

  function getRows() {
    return Array.from($('price-rows').querySelectorAll('.price-row')).map((row) => ({
      el: row,
      roomTypeId: row.querySelector('.price-row-select').value,
      priceRaw: row.querySelector('.price-row-input').value,
    }));
  }

  function updateNotListedHint() {
    const used = getRows().map((r) => r.roomTypeId);
    const remaining = roomTypes.filter((rt) => !used.includes(rt.id));
    const hint = $('not-listed-hint');
    if (remaining.length === 0) {
      hint.innerHTML = 'Every room type is priced on this plan.';
    } else {
      hint.innerHTML = `Not listed — uses base rate: ${remaining.map((rt) => `<strong>${escapeHtml(rt.name)}</strong> (${money(rt.baseRate)})`).join(', ')}.`;
    }
  }

  function addPriceRow(roomTypeId, price) {
    const container = $('price-rows');
    const row = doc.createElement('div');
    row.className = 'price-row';
    row.innerHTML =
      `<select class="input price-row-select" aria-label="Room type">${roomTypeOptionsHtml(roomTypeId)}</select>` +
      '<div class="price-row-amount"><span class="price-row-currency">$</span>' +
      `<input class="input price-row-input" type="number" min="0" step="1" placeholder="e.g. 150" aria-label="Price per night" value="${price !== undefined ? price : ''}" />` +
      '<span class="u-text-sm u-text-muted">/night</span></div>' +
      '<button class="icon-btn price-row-remove" type="button" aria-label="Remove this room type price">✕</button>';
    row.querySelector('.price-row-remove').addEventListener('click', () => { row.remove(); updateNotListedHint(); });
    row.querySelector('.price-row-select').addEventListener('change', updateNotListedHint);
    container.appendChild(row);
    updateNotListedHint();
  }

  $('add-row-btn').addEventListener('click', () => {
    const used = getRows().map((r) => r.roomTypeId);
    const next = roomTypes.find((rt) => !used.includes(rt.id)) || roomTypes[0];
    addPriceRow(next.id, undefined);
  });

  function clearErrors() {
    ['err-name', 'err-start', 'err-end', 'err-rows'].forEach((id) => { $(id).hidden = true; $(id).textContent = ''; });
    ['plan-name', 'plan-start', 'plan-end'].forEach((id) => $(id).classList.remove('has-error'));
  }

  function openEditor(planId) {
    editingPlanId = planId;
    clearErrors();
    $('price-rows').innerHTML = '';
    $('mode-new-btn').setAttribute('aria-pressed', planId ? 'false' : 'true');
    $('mode-edit-btn').setAttribute('aria-pressed', planId ? 'true' : 'false');

    if (!planId) {
      $('editor-heading').textContent = 'New rate plan';
      $('save-plan-btn').textContent = 'Save rate plan';
      $('plan-name').value = '';
      $('plan-start').value = '';
      $('plan-end').value = '';
      addPriceRow(roomTypes[0].id, undefined);
      return;
    }

    const plan = planById(planId);
    if (!plan) return;
    $('editor-heading').textContent = `Edit “${plan.name}”`;
    $('save-plan-btn').textContent = 'Save changes';
    $('plan-name').value = plan.name;
    $('plan-start').value = plan.startDate;
    $('plan-end').value = plan.endDate;
    Object.keys(plan.prices).forEach((rtId) => addPriceRow(rtId, plan.prices[rtId]));
    $('edit-picker-field').value = plan.id;
  }

  $('mode-new-btn').addEventListener('click', () => openEditor(null));
  $('mode-edit-btn').addEventListener('click', () => $('edit-picker-field').focus());
  $('load-plan-btn').addEventListener('click', () => {
    const id = $('edit-picker-field').value;
    if (id) openEditor(id);
  });
  $('cancel-editor-btn').addEventListener('click', () => showScreen('list'));

  function validate() {
    clearErrors();
    const errors = {};
    const name = $('plan-name').value.trim();
    const start = $('plan-start').value;
    const end = $('plan-end').value;
    if (!name) errors.name = 'Enter a rate plan name.';
    if (!start) errors.start = 'Choose a start date.';
    if (!end) errors.end = 'Choose an end date.';
    if (start && end && parseDate(end) < parseDate(start)) errors.end = 'End date must be on or after the start date.';

    const rows = getRows();
    const validRows = rows.filter((r) => r.roomTypeId && r.priceRaw !== '');
    if (validRows.length === 0) {
      errors.rows = 'Add at least one room type price.';
    } else {
      const ids = validRows.map((r) => r.roomTypeId);
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) errors.rows = `Each room type can only be listed once — “${roomTypeName(dup)}” is listed twice.`;
    }

    Object.keys(errors).forEach((key) => {
      const input = key === 'rows' ? null : $(`plan-${key}`);
      if (input) input.classList.add('has-error');
      const el = $(`err-${key}`);
      el.textContent = errors[key];
      el.hidden = false;
    });
    return { valid: Object.keys(errors).length === 0, name, start, end, rows: validRows };
  }

  $('save-plan-btn').addEventListener('click', () => {
    const result = validate();
    if (!result.valid) return;

    const prices = {};
    result.rows.forEach((r) => { prices[r.roomTypeId] = Number(r.priceRaw); });
    const payload = { name: result.name, startDate: result.start, endDate: result.end, prices };

    const request = editingPlanId ? api.update(editingPlanId, payload) : api.create(payload);
    request.then((plan) => {
      if (editingPlanId) {
        const idx = plans.findIndex((p) => p.id === plan.id);
        if (idx !== -1) plans[idx] = plan;
      } else {
        plans.push(plan);
      }
      renderList();
      populateEditPicker();
      showScreen('list');
      showToast(editingPlanId ? 'Rate plan updated.' : 'Rate plan saved and listed.');
    }).catch(() => {
      showToast('Rate plan could not be saved — please try again');
    });
  });

  $('show-validation-demo-btn').addEventListener('click', () => {
    openEditor(null);
    $('plan-name').value = '';
    $('plan-start').value = '2026-08-10';
    $('plan-end').value = '2026-08-01';
    $('price-rows').innerHTML = '';
    updateNotListedHint();
    validate();
  });

  /* ---------------- Price lookup (AC4, AC8) ---------------- */
  function populateLookupRoomTypes() {
    const sel = $('lookup-room-type');
    const prev = sel.value;
    sel.innerHTML = roomTypes.map((rt) => `<option value="${rt.id}">${escapeHtml(rt.name)}</option>`).join('');
    sel.value = roomTypes.some((rt) => rt.id === prev) ? prev : roomTypes[0].id;
  }

  function runLookup(roomTypeId, dateStr) {
    api.resolvePrice(roomTypeId, dateStr).then((result) => {
      const el = $('lookup-result');
      const rtName = roomTypeName(roomTypeId);
      const dateLabel = formatDate(dateStr);

      if (result.source === 'base') {
        el.innerHTML =
          '<span class="chip lookup-badge base">Base rate — no active rate plan</span>' +
          `<p class="price-amount">${money(result.price)}<span class="u-text-md u-text-muted">/night</span></p>` +
          `<p class="price-source">${escapeHtml(rtName)} · ${dateLabel}</p>` +
          `<p class="u-text-sm u-text-muted">No rate plan covers ${escapeHtml(rtName)} on this date, so the base rate is returned (AC8).</p>`;
        return;
      }

      let overlapNote = '';
      if (result.overlapping) {
        const otherNames = result.otherRatePlanIds.map((id) => `“${planName(id)}”`).join(', ');
        overlapNote = `<p class="u-text-sm u-text-muted">Overlaps with ${escapeHtml(otherNames)} for this room type and date. Rule: most recently created plan wins — “${escapeHtml(planName(result.ratePlanId))}” applies. The lookup never errors.</p>`;
      }

      el.innerHTML =
        `<span class="chip">Rate plan — “${escapeHtml(planName(result.ratePlanId))}”</span>` +
        `<p class="price-amount">${money(result.price)}<span class="u-text-md u-text-muted">/night</span></p>` +
        `<p class="price-source">${escapeHtml(rtName)} · ${dateLabel}</p>` +
        overlapNote;
    }).catch(() => {
      $('lookup-result').innerHTML = '<p class="u-text-sm u-text-muted">Price lookup failed — please try again.</p>';
    });
  }

  $('lookup-submit-btn').addEventListener('click', () => {
    runLookup($('lookup-room-type').value, $('lookup-date').value);
  });
  $('lookup-example-overlap').addEventListener('click', () => {
    $('lookup-room-type').value = 'rt-king';
    $('lookup-date').value = '2026-08-30';
    runLookup('rt-king', '2026-08-30');
  });
  $('lookup-example-base').addEventListener('click', () => {
    $('lookup-room-type').value = 'rt-twin';
    $('lookup-date').value = '2026-12-25';
    runLookup('rt-twin', '2026-12-25');
  });

  /* ---------------- Init ---------------- */
  renderBaseRates();
  renderList();
  populateEditPicker();
  populateLookupRoomTypes();
  openEditor(null);
  showScreen('list');
}

function createDefaultApi() {
  function jsonRequest(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return res.json();
    });
  }

  return {
    create: (data) => jsonRequest('/rate-plans', 'POST', { ...data, actor: STAFF_NAME }),
    update: (id, changes) => jsonRequest(`/rate-plans/${id}`, 'PATCH', { ...changes, actor: STAFF_NAME }),
    remove: (id) => fetch(`/rate-plans/${id}`, { method: 'DELETE' }).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return true;
    }),
    resolvePrice: (roomTypeId, date) => fetch(`/rate-plans/price-lookup?roomTypeId=${encodeURIComponent(roomTypeId)}&date=${encodeURIComponent(date)}`).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return res.json();
    }),
  };
}

module.exports = { initRatePlansApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    Promise.all([
      fetch('/room-types').then((res) => res.json()),
      fetch('/rate-plans').then((res) => res.json()),
    ]).then(([roomTypes, plans]) => {
      initRatePlansApp(document, roomTypes, plans, createDefaultApi());
    }).catch(() => {
      const toast = document.getElementById('toast');
      const toastMessage = document.getElementById('toast-message');
      if (toast && toastMessage) {
        toastMessage.textContent = 'Could not load rate plans — please refresh the page';
        toast.hidden = false;
      }
    });
  });
}
