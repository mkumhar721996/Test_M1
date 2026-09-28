const { escapeHtml } = require('./utils');

const STAFF_NAME = 'Priya Nair';

function statusChipHtml(status) {
  if (status === 'available') {
    return '<span class="status-chip status-chip--available"><span aria-hidden="true">●</span> Available</span>';
  }
  if (status === 'maintenance') {
    return '<span class="status-chip status-chip--maintenance"><span aria-hidden="true">◌</span> Maintenance</span>';
  }
  return '<span class="status-chip status-chip--out-of-order"><span aria-hidden="true">✕</span> Out of order</span>';
}

function initRoomsApp(doc, initialRooms, roomTypes, api) {
  let rooms = initialRooms.slice();
  const roomTypesById = new Map(roomTypes.map((rt) => [rt.id, rt]));
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
        <td class="room-identifier-cell">${escapeHtml(doc, r.identifier)}</td>
        <td>${escapeHtml(doc, roomTypeName(r.roomTypeId))}</td>
        <td>${statusChipHtml(r.status)}</td>
        <td class="col-actions">
          <select class="room-status-select" data-id="${r.id}" aria-label="Status for room ${escapeHtml(doc, r.identifier)}">
            <option value="available" ${r.status === 'available' ? 'selected' : ''}>Available</option>
            <option value="maintenance" ${r.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
            <option value="out-of-order" ${r.status === 'out-of-order' ? 'selected' : ''}>Out of order</option>
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
    }).catch(() => {
      select.value = previousStatus;
      showToast('Status could not be updated — please try again');
    });
  });

  /* ---------------- Create room ---------------- */
  const createOverlay = doc.getElementById('create-room-overlay');
  const createModal = doc.getElementById('create-room-modal');
  const createForm = doc.getElementById('create-room-form');
  const identifierInput = doc.getElementById('field-room-identifier');
  const roomTypeSelect = doc.getElementById('field-room-type');
  const identifierError = doc.getElementById('error-room-identifier');
  const roomTypeError = doc.getElementById('error-room-type');

  function populateRoomTypeOptions() {
    const options = roomTypes.map((rt) => `<option value="${rt.id}">${escapeHtml(doc, rt.name)}</option>`).join('');
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
    createOverlay.hidden = false;
    createModal.hidden = false;
  }
  function closeCreateModal() {
    createOverlay.hidden = true;
    createModal.hidden = true;
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

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!createModal.hidden) closeCreateModal();
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

module.exports = { initRoomsApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    Promise.all([
      fetch('/rooms').then((res) => res.json()),
      fetch('/room-types').then((res) => res.json()),
    ]).then(([rooms, roomTypes]) => {
      initRoomsApp(document, rooms, roomTypes, createDefaultApi());
    });
  });
}
