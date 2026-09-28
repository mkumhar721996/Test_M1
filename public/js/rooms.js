const STAFF_NAME = 'Priya Nair';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_ICONS = { available: '●', maintenance: '◌' };

function statusLabel(status) {
  return status.split('-').map((word, i) => (
    i > 0 && word === 'of' ? word : word.charAt(0).toUpperCase() + word.slice(1)
  )).join(' ');
}

function statusChipHtml(status) {
  const icon = STATUS_ICONS[status] || '✕';
  return `<span class="status-chip status-chip--${status}"><span aria-hidden="true">${icon}</span> ${statusLabel(status)}</span>`;
}

function initRoomsApp(doc, initialRooms, roomTypes, api, statuses) {
  let rooms = initialRooms.slice();
  const roomTypesById = new Map(roomTypes.map((rt) => [rt.id, rt]));
  const statusOptions = statuses && statuses.length
    ? statuses
    : Array.from(new Set(initialRooms.map((r) => r.status)));
  let toastTimer = null;

  const tableWrap = doc.getElementById('rooms-table-wrap');
  const emptyEl = doc.getElementById('rooms-empty');
  const tbody = doc.getElementById('room-tbody');

  function showToast(msg) {
    const el = doc.getElementById('toast');
    const msgEl = doc.getElementById('toast-message');
    msgEl.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function roomTypeName(roomTypeId) {
    const rt = roomTypesById.get(roomTypeId);
    return rt ? rt.name : roomTypeId;
  }

  function renderRooms() {
    if (rooms.length === 0) {
      tableWrap.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    tableWrap.hidden = false;
    emptyEl.hidden = true;
    tbody.innerHTML = rooms.map((r) => `
      <tr data-row-id="${r.id}">
        <td class="room-identifier-cell">${escapeHtml(r.identifier)}</td>
        <td>${escapeHtml(roomTypeName(r.roomTypeId))}</td>
        <td>${statusChipHtml(r.status)}</td>
        <td class="col-actions">
          <select class="room-status-select" data-id="${r.id}" aria-label="Status for room ${escapeHtml(r.identifier)}">
            ${statusOptions.map((s) => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');
  }

  tbody.addEventListener('change', (e) => {
    const select = e.target.closest('.room-status-select');
    if (!select) return;
    const id = select.dataset.id;
    const room = rooms.find((r) => r.id === id);
    const previousStatus = room ? room.status : select.value;
    const nextStatus = select.value;

    api.updateStatus(id, nextStatus).then((updated) => {
      const idx = rooms.findIndex((r) => r.id === updated.id);
      if (idx !== -1) rooms[idx] = updated;
      renderRooms();
      showToast(`Room ${updated.identifier} status set to ${updated.status}`);
    }).catch((err) => {
      console.error({ action: 'updateStatus', roomId: id, targetStatus: nextStatus, error: (err && err.message) || err });
      select.value = previousStatus;
      showToast('Status could not be updated — please try again');
    });
  });

  /* ---------------- Create room ---------------- */
  const createOverlay = doc.getElementById('create-room-overlay');
  const createModal = doc.getElementById('create-room-modal');
  const createModalPanel = createModal.querySelector('.modal-panel');
  const createForm = doc.getElementById('create-room-form');
  const identifierInput = doc.getElementById('field-room-identifier');
  const roomTypeSelect = doc.getElementById('field-room-type');
  const identifierError = doc.getElementById('error-room-identifier');
  const roomTypeError = doc.getElementById('error-room-type');
  let createModalOpenerEl = null;

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hidden);
  }

  function trapCreateModalTab(e) {
    const focusable = getFocusableElements(createModalPanel);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (doc.activeElement === first || !createModalPanel.contains(doc.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (doc.activeElement === last || !createModalPanel.contains(doc.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function onCreateModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCreateModal();
    } else if (e.key === 'Tab') {
      trapCreateModalTab(e);
    }
  }

  function populateRoomTypeOptions() {
    const options = roomTypes.map((rt) => `<option value="${rt.id}">${escapeHtml(rt.name)}</option>`).join('');
    roomTypeSelect.innerHTML = `<option value="">Select a room type</option>${options}`;
  }
  populateRoomTypeOptions();

  function clearCreateErrors() {
    identifierError.hidden = true;
    identifierError.textContent = '⚠ Enter a unique room identifier.';
    roomTypeError.hidden = true;
    identifierInput.classList.remove('input-error');
    roomTypeSelect.classList.remove('input-error');
  }

  function openCreateModal() {
    createForm.reset();
    clearCreateErrors();
    createModalOpenerEl = doc.activeElement;
    createOverlay.hidden = false;
    createModal.hidden = false;
    doc.addEventListener('keydown', onCreateModalKeydown);
    identifierInput.focus();
  }
  function closeCreateModal() {
    createOverlay.hidden = true;
    createModal.hidden = true;
    doc.removeEventListener('keydown', onCreateModalKeydown);
    if (createModalOpenerEl && typeof createModalOpenerEl.focus === 'function') {
      createModalOpenerEl.focus();
    }
    createModalOpenerEl = null;
  }

  doc.getElementById('new-room-btn').addEventListener('click', openCreateModal);
  const emptyAddBtn = doc.getElementById('rooms-empty-add-btn');
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', openCreateModal);
  doc.getElementById('create-room-close-btn').addEventListener('click', closeCreateModal);
  doc.getElementById('create-room-cancel-btn').addEventListener('click', closeCreateModal);
  createOverlay.addEventListener('click', closeCreateModal);

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearCreateErrors();

    const identifier = identifierInput.value.trim();
    const roomTypeId = roomTypeSelect.value;
    let valid = true;
    if (!identifier) {
      identifierError.textContent = '⚠ Enter a unique room identifier.';
      identifierError.hidden = false;
      identifierInput.classList.add('input-error');
      valid = false;
    }
    if (!roomTypeId) {
      roomTypeError.hidden = false;
      roomTypeSelect.classList.add('input-error');
      valid = false;
    }
    if (!valid) return;

    api.create({ identifier, roomTypeId, actor: STAFF_NAME }).then((room) => {
      rooms.unshift(room);
      closeCreateModal();
      renderRooms();
      showToast(`Room ${room.identifier} created`);
    }).catch((err) => {
      const message = (err && err.error) || 'a room with that identifier already exists';
      identifierError.textContent = `⚠ ${message}`;
      identifierError.hidden = false;
      identifierInput.classList.add('input-error');
    });
  });

  renderRooms();
}

function createDefaultApi() {
  function jsonRequest(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) {
        return res.json().catch(() => ({})).then((data) => Promise.reject({ status: res.status, error: data.error }));
      }
      return res.json();
    });
  }

  return {
    create: (data) => jsonRequest('/rooms', 'POST', { ...data, actor: STAFF_NAME }),
    updateStatus: (id, status) => jsonRequest(`/rooms/${id}/status`, 'PATCH', { status, actor: STAFF_NAME }),
  };
}

function bootRoomsApp(doc, fetchImpl) {
  return Promise.all([
    fetchImpl('/rooms').then((res) => res.json()),
    fetchImpl('/room-types').then((res) => res.json()),
    fetchImpl('/rooms/statuses').then((res) => res.json()),
  ]).then(([rooms, roomTypes, statusesRes]) => {
    initRoomsApp(doc, rooms, roomTypes, createDefaultApi(), statusesRes.statuses);
  }).catch((err) => {
    console.error({ action: 'bootRoomsApp', error: (err && err.message) || err, timestamp: Date.now() });
    doc.body.textContent = 'Failed to load rooms. Please refresh the page.';
  });
}

if (typeof module !== 'undefined') {
  module.exports = { initRoomsApp, createDefaultApi, bootRoomsApp };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    bootRoomsApp(document, fetch);
  });
}
