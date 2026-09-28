function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtRange(start, end) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function planStatus(plan, today) {
  if (today < plan.startDate) return 'upcoming';
  if (today > plan.endDate) return 'past';
  return 'active';
}

function statusChipHtml(status) {
  if (status === 'active') return '<span class="status-chip status-chip--active"><span aria-hidden="true">●</span> Active now</span>';
  if (status === 'upcoming') return '<span class="status-chip status-chip--upcoming"><span aria-hidden="true">▸</span> Upcoming</span>';
  return '<span class="status-chip status-chip--past"><span aria-hidden="true">◌</span> Past</span>';
}

function computeOverlapsForPlan(plan, allPlans) {
  const results = [];
  plan.prices.forEach((pr) => {
    allPlans.forEach((other) => {
      if (other.id === plan.id) return;
      const otherPrice = other.prices.find((p) => p.roomType === pr.roomType);
      if (!otherPrice) return;
      const overlapStart = plan.startDate > other.startDate ? plan.startDate : other.startDate;
      const overlapEnd = plan.endDate < other.endDate ? plan.endDate : other.endDate;
      if (overlapStart <= overlapEnd) {
        const winnerIsThis = new Date(plan.createdAt) >= new Date(other.createdAt);
        results.push({ roomType: pr.roomType, other, overlapStart, overlapEnd, winnerIsThis });
      }
    });
  });
  return results;
}

function initRatePlansApp(doc, initialPlans, roomTypes, api) {
  let plans = initialPlans.slice();
  let editingPlanId = null;
  let draftPrices = [];
  let planPendingDelete = null;
  let toastTimer = null;

  function roomTypeName(code) {
    const rt = roomTypes.find((r) => r.code === code);
    return rt ? rt.name : code;
  }
  function baseRate(code) {
    const rt = roomTypes.find((r) => r.code === code);
    return rt ? rt.baseRate : null;
  }

  const listScreen = doc.getElementById('rate-plans-screen');
  const editorScreen = doc.getElementById('editor-screen');
  const lookupScreen = doc.getElementById('lookup-screen');

  function showScreen(screen) {
    [listScreen, editorScreen, lookupScreen].forEach((s) => { s.hidden = s !== screen; });
  }

  function showToast(message) {
    const toast = doc.getElementById('toast');
    doc.getElementById('toast-message').textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  /* ---------------- Rate Plans list ---------------- */
  const tbody = doc.getElementById('rp-tbody');
  const tableWrap = doc.getElementById('rp-table-wrap');
  const emptyEl = doc.getElementById('rp-empty');

  function renderList() {
    doc.getElementById('rp-count-summary').textContent =
      plans.length === 1 ? '1 rate plan' : `${plans.length} rate plans`;

    if (plans.length === 0) {
      tableWrap.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    tableWrap.hidden = false;
    emptyEl.hidden = true;

    const today = todayIso();

    tbody.innerHTML = plans.map((plan) => {
      const priceChips = plan.prices.map((p) =>
        `<span class="chip">${escapeHtml(roomTypeName(p.roomType))} · $${p.price}/night</span>`).join('');
      const overlaps = computeOverlapsForPlan(plan, plans);
      const overlapHtml = overlaps.map((o) => {
        const roomName = escapeHtml(roomTypeName(o.roomType));
        const rangeTxt = fmtRange(o.overlapStart, o.overlapEnd);
        const verdict = o.winnerIsThis
          ? 'this plan applies (created more recently)'
          : `<strong>${escapeHtml(o.other.name)}</strong> applies (created more recently)`;
        return `<p class="overlap-note"><span aria-hidden="true">⚠</span> ${roomName} overlaps with <strong>${escapeHtml(o.other.name)}</strong> (${rangeTxt}) — ${verdict}.</p>`;
      }).join('');
      const fallbackNote = plan.prices.length < roomTypes.length
        ? `<p class="rp-fallback-note">${plan.prices.length} of ${roomTypes.length} room types priced — the rest use their base rate.</p>`
        : '';
      return `<tr>
        <td class="rp-name-cell"><strong>${escapeHtml(plan.name)}</strong><span class="rp-id">${plan.id} · Created ${fmtDate(plan.createdAt.slice(0, 10))}</span></td>
        <td>${fmtRange(plan.startDate, plan.endDate)}</td>
        <td>${statusChipHtml(planStatus(plan, today))}</td>
        <td><div class="price-chip-list">${priceChips}</div>${fallbackNote}${overlapHtml}</td>
        <td class="col-actions"><button class="view-link-btn" data-action="edit" data-id="${plan.id}" type="button">Edit</button><button class="view-link-btn" data-action="delete" data-id="${plan.id}" type="button">Delete</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-action="edit"]').forEach((b) =>
      b.addEventListener('click', () => openEditor(plans.find((p) => p.id === b.dataset.id))));
    tbody.querySelectorAll('[data-action="delete"]').forEach((b) =>
      b.addEventListener('click', () => openDeleteConfirm(plans.find((p) => p.id === b.dataset.id))));
  }

  doc.getElementById('new-plan-btn').addEventListener('click', () => openEditor(null));
  doc.getElementById('empty-new-plan-btn').addEventListener('click', () => openEditor(null));
  doc.getElementById('price-lookup-link').addEventListener('click', () => openLookup());

  /* ---------------- Delete confirm ---------------- */
  const deleteOverlay = doc.getElementById('delete-overlay');
  const deleteModal = doc.getElementById('delete-modal');

  function openDeleteConfirm(plan) {
    planPendingDelete = plan;
    doc.getElementById('delete-plan-name').textContent = plan.name;
    deleteOverlay.hidden = false;
    deleteModal.hidden = false;
  }
  function closeDeleteConfirm() {
    planPendingDelete = null;
    deleteOverlay.hidden = true;
    deleteModal.hidden = true;
  }
  doc.getElementById('delete-close-btn').addEventListener('click', closeDeleteConfirm);
  doc.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteConfirm);
  deleteOverlay.addEventListener('click', closeDeleteConfirm);
  doc.getElementById('confirm-delete-btn').addEventListener('click', () => {
    const plan = planPendingDelete;
    if (!plan) return;
    api.remove(plan.id).then(() => {
      plans = plans.filter((p) => p.id !== plan.id);
      closeDeleteConfirm();
      renderList();
      showToast(`"${plan.name}" deleted — its room types now use their base rate (or another overlapping plan, if any).`);
    }).catch(() => {
      closeDeleteConfirm();
      showToast('Rate plan could not be deleted — please try again');
    });
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !deleteModal.hidden) closeDeleteConfirm();
  });

  /* ---------------- Editor ---------------- */
  const nameInput = doc.getElementById('plan-name');
  const startInput = doc.getElementById('plan-start');
  const endInput = doc.getElementById('plan-end');
  const priceRowsEl = doc.getElementById('price-rows');

  function clearEditorErrors() {
    ['error-name', 'error-dates', 'error-price-rows'].forEach((id) => { doc.getElementById(id).hidden = true; });
    [nameInput, startInput, endInput].forEach((el) => el.classList.remove('input-error'));
  }

  function usedRoomTypes(excludeIdx) {
    return draftPrices.filter((p, i) => i !== excludeIdx && p.roomType).map((p) => p.roomType);
  }

  function renderPriceRows() {
    priceRowsEl.innerHTML = draftPrices.map((p, i) => {
      const used = usedRoomTypes(i);
      const options = roomTypes
        .filter((rt) => !used.includes(rt.code))
        .map((rt) => `<option value="${rt.code}"${rt.code === p.roomType ? ' selected' : ''}>${escapeHtml(rt.name)} (base $${rt.baseRate}/night)</option>`)
        .join('');
      return `<div class="rp-price-row" data-idx="${i}">
        <div class="field" style="margin-bottom:0;"><label class="label" for="price-room-${i}">Room type</label>
        <select class="input" id="price-room-${i}" data-role="room-select" data-idx="${i}"><option value="">Select room type…</option>${options}</select></div>
        <div class="field" style="margin-bottom:0;"><label class="label" for="price-amount-${i}">Price per night</label>
        <div class="price-input-wrap"><span aria-hidden="true">$</span><input class="input" id="price-amount-${i}" type="number" min="0" step="1" placeholder="0" value="${p.price === '' || p.price == null ? '' : p.price}" data-role="price-input" data-idx="${i}" /></div></div>
        <button type="button" class="price-row-remove" data-idx="${i}" aria-label="Remove this room type price row">✕</button>
      </div>`;
    }).join('');

    priceRowsEl.querySelectorAll('[data-role="room-select"]').forEach((sel) => {
      sel.addEventListener('change', (e) => { draftPrices[+e.target.dataset.idx].roomType = e.target.value; });
    });
    priceRowsEl.querySelectorAll('[data-role="price-input"]').forEach((inp) => {
      inp.addEventListener('input', (e) => { draftPrices[+e.target.dataset.idx].price = e.target.value; });
    });
    priceRowsEl.querySelectorAll('.price-row-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        draftPrices.splice(+e.currentTarget.dataset.idx, 1);
        renderPriceRows();
      });
    });
    const addBtn = doc.getElementById('add-price-row-btn');
    const allUsed = draftPrices.filter((p) => p.roomType).length >= roomTypes.length;
    addBtn.disabled = allUsed;
    addBtn.title = allUsed ? 'Every room type already has a price in this plan.' : '';
  }

  doc.getElementById('add-price-row-btn').addEventListener('click', () => {
    draftPrices.push({ roomType: '', price: '' });
    renderPriceRows();
  });

  function openEditor(plan) {
    editingPlanId = plan ? plan.id : null;
    doc.getElementById('editor-heading').textContent = plan ? 'Edit rate plan' : 'New rate plan';
    doc.getElementById('editor-save-btn').textContent = plan ? 'Save changes' : 'Create rate plan';
    nameInput.value = plan ? plan.name : '';
    startInput.value = plan ? plan.startDate : '';
    endInput.value = plan ? plan.endDate : '';
    draftPrices = plan ? plan.prices.map((p) => ({ ...p })) : [{ roomType: '', price: '' }];
    clearEditorErrors();
    renderPriceRows();
    showScreen(editorScreen);
  }

  doc.getElementById('editor-back-btn').addEventListener('click', () => showScreen(listScreen));
  doc.getElementById('editor-cancel-btn').addEventListener('click', () => showScreen(listScreen));

  doc.getElementById('editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearEditorErrors();
    let valid = true;

    const name = nameInput.value.trim();
    if (!name) {
      doc.getElementById('error-name').hidden = false;
      nameInput.classList.add('input-error');
      valid = false;
    }

    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end || end < start) {
      doc.getElementById('error-dates').hidden = false;
      if (!start) startInput.classList.add('input-error');
      if (!end || (start && end && end < start)) endInput.classList.add('input-error');
      valid = false;
    }

    const seen = new Set();
    let rowsValid = draftPrices.length > 0;
    draftPrices.forEach((p) => {
      const priceNum = Number(p.price);
      if (!p.roomType || p.price === '' || !(priceNum > 0)) rowsValid = false;
      if (p.roomType) {
        if (seen.has(p.roomType)) rowsValid = false;
        seen.add(p.roomType);
      }
    });
    if (!rowsValid) {
      doc.getElementById('error-price-rows').hidden = false;
      valid = false;
    }

    if (!valid) return;

    const cleanPrices = draftPrices.map((p) => ({ roomType: p.roomType, price: Number(p.price) }));
    const payload = { name, startDate: start, endDate: end, prices: cleanPrices };

    const request = editingPlanId ? api.update(editingPlanId, payload) : api.create(payload);
    request.then((plan) => {
      const idx = plans.findIndex((p) => p.id === plan.id);
      if (idx !== -1) plans[idx] = plan; else plans.unshift(plan);
      renderList();
      showScreen(listScreen);
      showToast(editingPlanId
        ? 'Rate plan updated — the new name, dates, and prices apply to future price lookups.'
        : 'Rate plan created — it now appears in the list and is ready for price lookups.');
    }).catch(() => {
      showToast('Rate plan could not be saved — please try again');
    });
  });

  /* ---------------- Price Lookup ---------------- */
  const lookupRoomSelect = doc.getElementById('lookup-room');
  lookupRoomSelect.innerHTML = roomTypes.map((rt) => `<option value="${rt.code}">${escapeHtml(rt.name)}</option>`).join('');

  function openLookup() {
    showScreen(lookupScreen);
  }
  doc.getElementById('lookup-back-btn').addEventListener('click', () => showScreen(listScreen));

  function renderLookupResult(roomType, dateStr, result) {
    doc.getElementById('lookup-loading').hidden = true;
    const panel = doc.getElementById('lookup-result');
    panel.hidden = false;
    doc.getElementById('lookup-price').textContent = `$${result.price}/night`;
    const overlapNote = doc.getElementById('lookup-overlap-note');
    const overlapText = doc.getElementById('lookup-overlap-text');

    if (result.source === 'base') {
      doc.getElementById('lookup-source-text').textContent =
        `${roomTypeName(roomType)} on ${fmtDate(dateStr)} — Base rate (no rate plan covers this room type on this date)`;
      overlapNote.hidden = true;
    } else {
      doc.getElementById('lookup-source-text').textContent =
        `${roomTypeName(roomType)} on ${fmtDate(dateStr)} — from rate plan "${result.plan.name}" (${fmtRange(result.plan.startDate, result.plan.endDate)})`;
      if (result.overlapping && result.overlapping.length > 0) {
        const other = result.overlapping[0];
        const otherPrice = other.prices.find((p) => p.roomType === roomType).price;
        overlapText.innerHTML = `Also overlaps with <strong>${escapeHtml(other.name)}</strong> ($${otherPrice}/night), created ${fmtDate(other.createdAt.slice(0, 10))}. "${escapeHtml(result.plan.name)}" applies instead because it was created more recently, on ${fmtDate(result.plan.createdAt.slice(0, 10))} — the most-recently-created overlapping plan always wins, so the result is never ambiguous.`;
        overlapNote.hidden = false;
      } else {
        overlapNote.hidden = true;
      }
    }
  }

  function runLookup(roomType, dateStr) {
    if (!roomType || !dateStr) return;
    doc.getElementById('lookup-result').hidden = true;
    doc.getElementById('lookup-loading').hidden = false;
    api.priceLookup(roomType, dateStr).then((result) => {
      renderLookupResult(roomType, dateStr, result);
    }).catch(() => {
      doc.getElementById('lookup-loading').hidden = true;
    });
  }

  doc.getElementById('lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runLookup(lookupRoomSelect.value, doc.getElementById('lookup-date').value);
  });

  doc.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lookupRoomSelect.value = btn.dataset.room;
      doc.getElementById('lookup-date').value = btn.dataset.date;
      showScreen(lookupScreen);
      runLookup(btn.dataset.room, btn.dataset.date);
    });
  });

  renderList();
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
    create: (data) => jsonRequest('/rate-plans', 'POST', data),
    update: (id, changes) => jsonRequest(`/rate-plans/${id}`, 'PATCH', changes),
    remove: (id) => fetch(`/rate-plans/${id}`, { method: 'DELETE' }).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
    }),
    priceLookup: (roomType, date) => fetch(`/rate-plans/price-lookup?roomType=${encodeURIComponent(roomType)}&date=${encodeURIComponent(date)}`)
      .then((res) => {
        if (!res.ok) return Promise.reject({ status: res.status });
        return res.json();
      }),
  };
}

module.exports = { initRatePlansApp, createDefaultApi, computeOverlapsForPlan };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    Promise.all([
      fetch('/rate-plans').then((res) => (res.ok ? res.json() : Promise.reject({ status: res.status }))),
      fetch('/rate-plans/room-types').then((res) => (res.ok ? res.json() : Promise.reject({ status: res.status }))),
    ]).then(([plans, roomTypes]) => {
      initRatePlansApp(document, plans, roomTypes, createDefaultApi());
    }).catch((err) => {
      console.error('Failed to load rate plans:', err);
      const container = document.getElementById('rate-plans-screen');
      container.innerHTML = `<div class="page">
        <div class="card empty-state">
          <span class="icon" aria-hidden="true">⚠</span>
          <h3>Couldn't load rate plans</h3>
          <p>Something went wrong while loading this page. Please refresh to try again.</p>
        </div>
      </div>`;
    });
  });
}
