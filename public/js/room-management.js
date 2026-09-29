const STAFF_NAME = 'Priya Nair';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_LABELS = {
  available: 'Available',
  maintenance: 'Maintenance',
  'out-of-order': 'Out of order',
};

function statusChipHtml(status) {
  const icon = status === 'available' ? '●' : status === 'maintenance' ? '◌' : '✕';
  return `<span class="status-chip status-chip--${status}"><span aria-hidden="true">${icon}</span> ${STATUS_LABELS[status] || status}</span>`;
}

function statusOptionsHtml(currentStatus) {
  return Object.keys(STATUS_LABELS).map((value) =>
    `<option value="${value}"${value === currentStatus ? ' selected' : ''}>${STATUS_LABELS[value]}</option>`
  ).join('');
}

function initRoomManagementApp(doc, roomTypes, initialRooms, api) {
  let rooms = initialRooms.slice();
  let toastTimer = null;

  const listWrap = doc.getElementById('room-list-wrap');
  const emptyEl = doc.getElementById('room-list-empty');
  const roomTypeSelect = doc.getElementById('field-room-type');

  roomTypes.forEach((rt) => {
    const opt = doc.createElement('option');
    opt.value = rt.id;
    opt.textContent = rt.name;
    roomTypeSelect.appendChild(opt);
  });

  function showToast(msg) {
    const el = doc.getElementById('toast');
    doc.getElementById('toast-message').textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function render() {
    if (rooms.length === 0) {
      listWrap.hidden = true;
      listWrap.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    listWrap.hidden = false;
    emptyEl.hidden = true;

    listWrap.innerHTML = roomTypes.filter((rt) => rooms.some((r) => r.roomTypeId === rt.id)).map((rt) => {
      const rtRooms = rooms.filter((r) => r.roomTypeId === rt.id);
      return `
        <div class="card room-type-group" data-room-type-id="${rt.id}">
          <h2 class="card-title">${escapeHtml(rt.name)}</h2>
          <table class="room-table">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Status</th>
                <th scope="col" class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rtRooms.map((r) => `
                <tr data-room-id="${r.id}">
                  <td>${escapeHtml(r.identifier)}</td>
                  <td>${statusChipHtml(r.status)}</td>
                  <td class="col-actions">
                    <select class="input room-status-select" data-id="${r.id}" aria-label="Status for room ${escapeHtml(r.identifier)}">
                      ${statusOptionsHtml(r.status)}
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  }

  /* ---------------- Create room ---------------- */
  const createOverlay = doc.getElementById('create-overlay');
  const createModal = doc.getElementById('create-modal');
  const createForm = doc.getElementById('create-form');

  function clearCreateErrors() {
    doc.getElementById('error-identifier').hidden = true;
    doc.getElementById('error-room-type').hidden = true;
    doc.getElementById('field-identifier').classList.remove('input-error');
    doc.getElementById('field-room-type').classList.remove('input-error');
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
  doc.getElementById('empty-add-room-btn').addEventListener('click', openCreateModal);
  doc.getElementById('create-close-btn').addEventListener('click', closeCreateModal);
  doc.getElementById('create-cancel-btn').addEventListener('click', closeCreateModal);
  createOverlay.addEventListener('click', closeCreateModal);

  function showFieldErrors(fields) {
    if (fields.identifier) {
      const el = doc.getElementById('error-identifier');
      el.textContent = `⚠ ${fields.identifier}`;
      el.hidden = false;
      doc.getElementById('field-identifier').classList.add('input-error');
    }
    if (fields.roomTypeId) {
      const el = doc.getElementById('error-room-type');
      el.textContent = `⚠ ${fields.roomTypeId}`;
      el.hidden = false;
      doc.getElementById('field-room-type').classList.add('input-error');
    }
  }

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearCreateErrors();
    const identifier = doc.getElementById('field-identifier').value.trim();
    const roomTypeId = doc.getElementById('field-room-type').value;
    let valid = true;
    if (!identifier) {
      doc.getElementById('error-identifier').hidden = false;
      doc.getElementById('field-identifier').classList.add('input-error');
      valid = false;
    }
    if (!roomTypeId) {
      doc.getElementById('error-room-type').hidden = false;
      doc.getElementById('field-room-type').classList.add('input-error');
      valid = false;
    }
    if (!valid) return;

    api.create({ identifier, roomTypeId, actor: STAFF_NAME }).then((room) => {
      rooms.push(room);
      closeCreateModal();
      render();
      showToast(`Room ${room.identifier} created`);
    }).catch((err) => {
      if (err && err.fields) {
        showFieldErrors(err.fields);
      } else {
        showToast('Room could not be created — please try again');
      }
    });
  });

  /* ---------------- Status changes ---------------- */
  listWrap.addEventListener('change', (e) => {
    const select = e.target.closest('.room-status-select');
    if (!select) return;
    const id = select.getAttribute('data-id');
    const room = rooms.find((r) => r.id === id);
    const previousStatus = room ? room.status : select.value;
    const nextStatus = select.value;

    api.updateStatus(id, nextStatus).then((updated) => {
      const idx = rooms.findIndex((r) => r.id === id);
      if (idx !== -1) rooms[idx] = updated;
      render();
      showToast(`Room ${updated.identifier} status set to ${STATUS_LABELS[updated.status] || updated.status}`);
    }).catch(() => {
      select.value = previousStatus;
      showToast('Status could not be updated — please try again');
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!createModal.hidden) closeCreateModal();
  });

  render();
}

function createDefaultApi() {
  return {
    create: (data) => fetch('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: STAFF_NAME }),
    }).then(async (res) => {
      if (!res.ok) return Promise.reject({ status: res.status, ...(await res.json()) });
      return res.json();
    }),
    updateStatus: (id, status) => fetch(`/rooms/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, actor: STAFF_NAME }),
    }).then(async (res) => {
      if (!res.ok) return Promise.reject({ status: res.status, ...(await res.json()) });
      return res.json();
    }),
  };
}

module.exports = { initRoomManagementApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    Promise.all([
      fetch('/rooms/room-types').then((res) => res.json()),
      fetch('/rooms').then((res) => res.json()),
    ]).then(([roomTypes, rooms]) => {
      initRoomManagementApp(document, roomTypes, rooms, createDefaultApi());
    }).catch((err) => {
      console.error('Failed to load room data:', err);
      document.body.innerHTML = '<div style="padding:2rem;text-align:center;"><h2>Error Loading Rooms</h2><p>Please refresh the page to try again.</p></div>';
    });
  });
}
