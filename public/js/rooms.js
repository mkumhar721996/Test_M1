function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_LABEL = { available: 'Available', occupied: 'Occupied', maintenance: 'Maintenance' };
const STATUS_ICON = { available: '✓', occupied: '●', maintenance: '⚠' };

function statusChipHtml(status, active) {
  if (active === false) return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">◌</span> Deactivated</span>';
  return `<span class="status-chip status-chip--${status}"><span aria-hidden="true">${STATUS_ICON[status]}</span> ${STATUS_LABEL[status]}</span>`;
}

function reservationChipHtml(res) {
  if (res.state === 'checked_in') {
    return `<span class="status-chip status-chip--checked-in"><span aria-hidden="true">●</span> Checked-in — ${escapeHtml(res.guest)}</span>`;
  }
  return `<span class="status-chip status-chip--booked"><span aria-hidden="true">▸</span> Booked — ${escapeHtml(res.guest)}</span>`;
}

function reservationsSummary(reservations) {
  if (!reservations.length) return null;
  const checkedIn = reservations.filter((r) => r.state === 'checked_in').length;
  const booked = reservations.filter((r) => r.state === 'booked').length;
  const parts = [];
  if (checkedIn) parts.push(`${checkedIn} checked-in`);
  if (booked) parts.push(`${booked} booked`);
  return `${parts.join(', ')} reservation${reservations.length > 1 ? 's' : ''}`;
}

function maintenanceBlockCopy(room) {
  const summary = reservationsSummary(room.reservations);
  const first = room.reservations[0];
  return `Can't move Room ${room.number} to Maintenance — it has ${summary} (${first.guest}, ${first.dates}). Resolve or reassign the conflicting reservation${room.reservations.length > 1 ? 's' : ''} first.`;
}

const DENIED_COPY = {
  view: { title: "You don't have permission to view the room inventory", copy: 'Room records are managed by front-desk staff. Ask a front-desk lead for access.' },
  create: { title: "You don't have permission to create rooms", copy: 'Only front-desk staff can add new room records. Nothing was created.' },
  update: { title: "You don't have permission to update rooms", copy: "Only front-desk staff can change a room's number, type, or status. Nothing was changed." },
  deactivate: { title: "You don't have permission to deactivate rooms", copy: 'Only front-desk staff can deactivate a room record. Nothing was changed.' },
};

function initRoomsApp(doc, initialRooms, api) {
  let rooms = initialRooms.slice();
  let editingRoomId = null;
  let deactivatingRoomId = null;
  let deniedAction = 'view';
  let toastTimer = null;

  const roleSelect = doc.getElementById('role-select');
  const deniedPanel = doc.getElementById('denied-panel');
  const deniedTitle = doc.getElementById('denied-title');
  const deniedCopy = doc.getElementById('denied-copy');
  const deniedTabs = Array.from(doc.querySelectorAll('[data-denied-action]'));
  const frontDeskContent = doc.getElementById('front-desk-content');
  const roomsTableWrap = doc.getElementById('rooms-table-wrap');
  const roomsTbody = doc.getElementById('rooms-tbody');
  const roomsEmptyCreated = doc.getElementById('rooms-empty-created');
  const roomsEmptySearch = doc.getElementById('rooms-empty-search');
  const searchInput = doc.getElementById('search-input');
  const showInactiveToggle = doc.getElementById('show-inactive-toggle');
  const newRoomBtn = doc.getElementById('new-room-btn');
  const emptyCreateBtn = doc.getElementById('empty-create-btn');
  const clearSearchBtn = doc.getElementById('clear-search-btn');

  function showToast(msg) {
    const el = doc.getElementById('toast');
    doc.getElementById('toast-message').textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function roomExistsWithNumber(number, excludeId) {
    const needle = String(number).trim().toLowerCase();
    return rooms.some((r) => r.id !== excludeId && String(r.number).trim().toLowerCase() === needle);
  }

  function findRoom(id) {
    return rooms.find((r) => r.id === id) || null;
  }

  function renderDeniedPanel(overrideTitle) {
    const d = DENIED_COPY[deniedAction];
    deniedTitle.textContent = overrideTitle || d.title;
    deniedCopy.textContent = d.copy;
    deniedTabs.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.deniedAction === deniedAction));
    });
  }

  function filteredRooms() {
    const term = searchInput.value.trim().toLowerCase();
    return rooms.filter((r) => {
      if (!showInactiveToggle.checked && r.active === false) return false;
      if (!term) return true;
      const haystack = `${r.number} ${r.type} ${STATUS_LABEL[r.status] || r.status}`.toLowerCase();
      return haystack.indexOf(term) !== -1;
    });
  }

  function renderRoomsTable() {
    if (rooms.length === 0) {
      roomsTableWrap.hidden = true;
      roomsEmptySearch.hidden = true;
      roomsEmptyCreated.hidden = false;
      return;
    }
    roomsEmptyCreated.hidden = true;

    const visible = filteredRooms();
    if (visible.length === 0) {
      roomsTableWrap.hidden = true;
      roomsEmptySearch.hidden = false;
      roomsEmptySearch.querySelector('.empty-query').textContent = searchInput.value.trim();
      return;
    }
    roomsEmptySearch.hidden = true;
    roomsTableWrap.hidden = false;

    roomsTbody.innerHTML = visible.map((r) => {
      let reservationsCell;
      if (r.active === false) {
        reservationsCell = '<span class="no-reservations-note">—</span>';
      } else if (r.reservations.length === 0) {
        reservationsCell = '<span class="no-reservations-note">No active reservations</span>';
      } else {
        reservationsCell = `<div class="reservation-chip-stack">${r.reservations.map(reservationChipHtml).join('')}</div>`;
      }
      const actionsCell = r.active === false
        ? `<button class="row-action-btn" type="button" data-reactivate="${r.id}">Reactivate</button>`
        : `<button class="row-action-btn" type="button" data-edit="${r.id}">Edit</button>` +
          `<button class="row-action-btn" type="button" data-deactivate="${r.id}">Deactivate</button>`;
      return `<tr${r.active === false ? ' class="is-inactive-row"' : ''}>` +
        `<td class="room-number-cell">${escapeHtml(r.number)}${r.justCreated ? ' <span class="new-badge">New</span>' : ''}</td>` +
        `<td>${escapeHtml(r.type)}</td>` +
        `<td>${statusChipHtml(r.status, r.active)}</td>` +
        `<td>${reservationsCell}</td>` +
        `<td class="col-actions">${actionsCell}</td>` +
        '</tr>';
    }).join('');
  }

  searchInput.addEventListener('input', renderRoomsTable);
  showInactiveToggle.addEventListener('change', renderRoomsTable);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderRoomsTable();
    searchInput.focus();
  });

  function refreshForRole() {
    api.list().then((data) => {
      rooms = data;
      deniedPanel.hidden = true;
      frontDeskContent.hidden = false;
      renderRoomsTable();
    }).catch((err) => {
      rooms = [];
      frontDeskContent.hidden = true;
      deniedPanel.hidden = false;
      deniedAction = 'view';
      const message = err && err.body && err.body.message;
      renderDeniedPanel(message);
    });
  }

  roleSelect.addEventListener('change', refreshForRole);

  deniedTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      deniedAction = btn.dataset.deniedAction;
      renderDeniedPanel();
    });
  });

  /* ---------------- Create room ---------------- */
  const createOverlay = doc.getElementById('create-overlay');
  const createModal = doc.getElementById('create-modal');
  const createForm = doc.getElementById('create-form');
  const createSaveBtn = doc.getElementById('create-save-btn');
  const fieldNumber = doc.getElementById('field-number');
  const fieldType = doc.getElementById('field-type');
  const fieldStatus = doc.getElementById('field-status');
  const errorNumber = doc.getElementById('error-number');
  const errorType = doc.getElementById('error-type');

  function openCreateModal() {
    createForm.reset();
    errorNumber.hidden = true; errorType.hidden = true;
    fieldNumber.classList.remove('input-error'); fieldType.classList.remove('input-error');
    createOverlay.hidden = false; createModal.hidden = false;
    fieldNumber.focus();
  }
  function closeCreateModal() { createOverlay.hidden = true; createModal.hidden = true; }

  newRoomBtn.addEventListener('click', openCreateModal);
  emptyCreateBtn.addEventListener('click', openCreateModal);
  doc.getElementById('create-close-btn').addEventListener('click', closeCreateModal);
  doc.getElementById('create-cancel-btn').addEventListener('click', closeCreateModal);
  createOverlay.addEventListener('click', closeCreateModal);

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const number = fieldNumber.value.trim();
    const type = fieldType.value;
    const status = fieldStatus.value;
    let valid = true;
    errorNumber.hidden = true; fieldNumber.classList.remove('input-error');
    errorType.hidden = true; fieldType.classList.remove('input-error');

    if (!number) {
      errorNumber.textContent = '⚠ Enter a room number.';
      errorNumber.hidden = false; fieldNumber.classList.add('input-error'); valid = false;
    } else if (roomExistsWithNumber(number, null)) {
      errorNumber.textContent = `⚠ Room ${number} already exists. Enter a different room number.`;
      errorNumber.hidden = false; fieldNumber.classList.add('input-error'); valid = false;
    }
    if (!type) {
      errorType.hidden = false; fieldType.classList.add('input-error'); valid = false;
    }
    if (!valid) return;

    api.create({ number, type, status }).then((room) => {
      rooms.forEach((r) => { r.justCreated = false; });
      room.justCreated = true;
      rooms.unshift(room);
      closeCreateModal();
      renderRoomsTable();
      showToast(`Room ${room.number} created.`);
    }).catch((err) => {
      const fields = (err && err.body && err.body.fields) || {};
      if (fields.number) {
        errorNumber.textContent = `⚠ ${fields.number}`;
        errorNumber.hidden = false; fieldNumber.classList.add('input-error');
      }
      if (fields.type) {
        errorType.hidden = false; fieldType.classList.add('input-error');
      }
      if (!fields.number && !fields.type) {
        showToast('Room could not be created — please try again.');
      }
    });
  });

  /* ---------------- Edit room ---------------- */
  const editOverlay = doc.getElementById('edit-overlay');
  const editModal = doc.getElementById('edit-modal');
  const editForm = doc.getElementById('edit-form');
  const editSaveBtn = doc.getElementById('edit-save-btn');
  const editNumber = doc.getElementById('edit-number');
  const editType = doc.getElementById('edit-type');
  const editStatus = doc.getElementById('edit-status');
  const editErrorNumber = doc.getElementById('edit-error-number');
  const editBlockNote = doc.getElementById('edit-block-note');
  const editBlockCopy = doc.getElementById('edit-block-copy');
  const editModalSubtitle = doc.getElementById('edit-modal-subtitle');

  function openEditModal(id) {
    const room = findRoom(id);
    if (!room) return;
    editingRoomId = id;
    editModalSubtitle.textContent = `Room ${room.number} · ${room.type}`;
    editNumber.value = room.number;
    editType.value = room.type;
    editStatus.value = room.status;
    editErrorNumber.hidden = true; editNumber.classList.remove('input-error');
    editBlockNote.hidden = true;
    editOverlay.hidden = false; editModal.hidden = false;
    editNumber.focus();
  }
  function closeEditModal() { editOverlay.hidden = true; editModal.hidden = true; editingRoomId = null; }

  doc.getElementById('edit-close-btn').addEventListener('click', closeEditModal);
  doc.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  editOverlay.addEventListener('click', closeEditModal);

  roomsTbody.addEventListener('click', (e) => {
    const editId = e.target.getAttribute('data-edit');
    const deactivateId = e.target.getAttribute('data-deactivate');
    const reactivateId = e.target.getAttribute('data-reactivate');
    if (editId) openEditModal(editId);
    if (deactivateId) openDeactivateModal(deactivateId);
    if (reactivateId) doReactivate(reactivateId);
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const room = findRoom(editingRoomId);
    if (!room) return;
    const number = editNumber.value.trim();
    const type = editType.value;
    const status = editStatus.value;
    let valid = true;

    editErrorNumber.hidden = true; editNumber.classList.remove('input-error');
    editBlockNote.hidden = true;

    if (!number) {
      editErrorNumber.textContent = '⚠ Enter a room number.';
      editErrorNumber.hidden = false; editNumber.classList.add('input-error'); valid = false;
    } else if (roomExistsWithNumber(number, room.id)) {
      editErrorNumber.textContent = `⚠ Room ${number} already exists. Enter a different room number.`;
      editErrorNumber.hidden = false; editNumber.classList.add('input-error'); valid = false;
    }

    if (status === 'maintenance' && room.reservations.length > 0) {
      editBlockCopy.textContent = maintenanceBlockCopy(room);
      editBlockNote.hidden = false;
      valid = false;
    }

    if (!valid) return;

    api.update(room.id, { number, type, status }).then((updated) => {
      const idx = rooms.findIndex((r) => r.id === updated.id);
      if (idx !== -1) rooms[idx] = Object.assign({}, rooms[idx], updated);
      closeEditModal();
      renderRoomsTable();
      showToast(`Room ${updated.number} updated.`);
    }).catch((err) => {
      if (err && err.status === 409) {
        editBlockCopy.textContent = err.body.message;
        editBlockNote.hidden = false;
        return;
      }
      const fields = (err && err.body && err.body.fields) || {};
      if (fields.number) {
        editErrorNumber.textContent = `⚠ ${fields.number}`;
        editErrorNumber.hidden = false; editNumber.classList.add('input-error');
      }
      if (!fields.number) {
        showToast('Room could not be saved — please try again.');
      }
    });
  });

  /* ---------------- Deactivate room ---------------- */
  const deactivateOverlay = doc.getElementById('deactivate-overlay');
  const deactivateModal = doc.getElementById('deactivate-modal');
  const deactivateConfirmBtn = doc.getElementById('deactivate-confirm-btn');
  const deactivateConsequenceCopy = doc.getElementById('deactivate-consequence-copy');

  function openDeactivateModal(id) {
    const room = findRoom(id);
    if (!room) return;
    deactivatingRoomId = id;
    deactivateConsequenceCopy.textContent = `Room ${room.number} will no longer appear in the active inventory list. Its record is retained — nothing is deleted — and it can be reactivated later.`;
    deactivateOverlay.hidden = false; deactivateModal.hidden = false;
  }
  function closeDeactivateModal() { deactivateOverlay.hidden = true; deactivateModal.hidden = true; deactivatingRoomId = null; }

  doc.getElementById('deactivate-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);

  deactivateConfirmBtn.addEventListener('click', () => {
    const room = findRoom(deactivatingRoomId);
    if (!room) return;
    api.deactivate(room.id).then((updated) => {
      const idx = rooms.findIndex((r) => r.id === updated.id);
      if (idx !== -1) rooms[idx] = Object.assign({}, rooms[idx], updated);
      closeDeactivateModal();
      renderRoomsTable();
      showToast(`Room ${updated.number} deactivated.`);
    }).catch(() => {
      closeDeactivateModal();
      showToast('Deactivation could not be completed — please try again.');
    });
  });

  function doReactivate(id) {
    const room = findRoom(id);
    if (!room) return;
    api.reactivate(id).then((updated) => {
      const idx = rooms.findIndex((r) => r.id === updated.id);
      if (idx !== -1) rooms[idx] = Object.assign({}, rooms[idx], updated);
      renderRoomsTable();
      showToast(`Room ${updated.number} reactivated.`);
    }).catch(() => {
      showToast('Reactivation could not be completed — please try again.');
    });
  }

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!createModal.hidden) closeCreateModal();
    if (!editModal.hidden) closeEditModal();
    if (!deactivateModal.hidden) closeDeactivateModal();
  });

  renderDeniedPanel();
  renderRoomsTable();
}

function createDefaultApi(getRole) {
  function request(url, method, body) {
    const opts = {
      method,
      headers: { 'x-staff-role': getRole() },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then((res) => res.json().then((json) => {
      if (!res.ok) return Promise.reject({ status: res.status, body: json });
      return json;
    }));
  }

  return {
    list: () => request('/rooms', 'GET'),
    create: (data) => request('/rooms', 'POST', data),
    update: (id, changes) => request(`/rooms/${id}`, 'PATCH', changes),
    deactivate: (id) => request(`/rooms/${id}/deactivate`, 'POST', {}),
    reactivate: (id) => request(`/rooms/${id}/reactivate`, 'POST', {}),
  };
}

module.exports = { initRoomsApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('role-select');
    const api = createDefaultApi(() => roleSelect.value);
    const loading = document.getElementById('rooms-loading');
    if (loading) loading.hidden = false;
    api.list().then((rooms) => {
      if (loading) loading.hidden = true;
      initRoomsApp(document, rooms, api);
    }).catch(() => {
      if (loading) loading.hidden = true;
      initRoomsApp(document, [], api);
    });
  });
}
