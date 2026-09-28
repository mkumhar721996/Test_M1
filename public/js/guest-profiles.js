const STAFF_NAME = 'Priya Nair';

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function statusChipHtml(status) {
  if (status === 'active') {
    return '<span class="status-chip status-chip--active"><span aria-hidden="true">●</span> Active</span>';
  }
  return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">◌</span> Deactivated</span>';
}

function bookingStatusChipHtml(status) {
  if (status === 'Upcoming') return '<span class="status-chip status-chip--upcoming"><span aria-hidden="true">▸</span> Upcoming</span>';
  if (status === 'Cancelled') return '<span class="status-chip status-chip--cancelled"><span aria-hidden="true">✕</span> Cancelled</span>';
  return '<span class="status-chip status-chip--completed"><span aria-hidden="true">✓</span> Completed</span>';
}

function contactSummary(g) {
  const parts = [];
  if (g.email) parts.push(g.email);
  if (g.phone) parts.push(g.phone);
  return parts.length ? parts.join(' · ') : '—';
}

function diffChanges(guest, form) {
  const changes = {};
  if (form.name !== guest.name) changes.name = form.name;
  if (form.email !== (guest.email || '')) changes.email = form.email;
  if (form.phone !== (guest.phone || '')) changes.phone = form.phone;
  if (form.roomType !== (guest.preferences.roomType || '')) changes.roomType = form.roomType;
  if (form.dietary !== (guest.preferences.dietary || '')) changes.dietary = form.dietary;
  if (form.communication !== (guest.preferences.communication || '')) changes.communication = form.communication;
  return changes;
}

function initGuestProfilesApp(doc, initialGuests, api) {
  let guests = initialGuests.slice();
  let currentGuest = null;
  let lastMutationTs = null;
  let toastTimer = null;
  let profileToastTimer = null;

  const directoryScreen = doc.getElementById('directory-screen');
  const profileScreen = doc.getElementById('profile-screen');
  const tableWrap = doc.getElementById('directory-table-wrap');
  const emptyEl = doc.getElementById('directory-empty');
  const notFoundEl = doc.getElementById('directory-not-found');
  const tbody = doc.getElementById('guest-tbody');
  const searchInput = doc.getElementById('search-input');

  function showToast(el, msgEl, msg, which) {
    msgEl.textContent = msg;
    el.hidden = false;
    if (which === 'directory') {
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
    } else {
      clearTimeout(profileToastTimer);
      profileToastTimer = setTimeout(() => { el.hidden = true; }, 3200);
    }
  }

  function renderDirectory(list) {
    notFoundEl.hidden = true;
    if (list.length === 0) {
      tableWrap.hidden = true;
      emptyEl.hidden = false;
      emptyEl.querySelector('.empty-query').textContent = searchInput.value.trim();
      return;
    }
    tableWrap.hidden = false;
    emptyEl.hidden = true;
    tbody.innerHTML = list.map((g) => `
      <tr class="guest-row" tabindex="0" role="button" data-id="${g.id}" aria-label="View profile for ${escapeHtml(g.name)}">
        <td class="guest-name-cell">${escapeHtml(g.name)}<span class="guest-id">${g.id}</span></td>
        <td>${escapeHtml(contactSummary(g))}</td>
        <td>${statusChipHtml(g.status)}</td>
        <td>${fmtDateTime(g.updatedAt)}</td>
        <td class="col-actions"><button type="button" class="view-link-btn" data-id="${g.id}">View profile →</button></td>
      </tr>
    `).join('');
  }

  function applySearchFilter() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { renderDirectory(guests); return; }
    const filtered = guests.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (g.email && g.email.toLowerCase().includes(q)) ||
      (g.phone && g.phone.includes(q)) ||
      g.id.toLowerCase().includes(q));
    renderDirectory(filtered);
  }

  searchInput.addEventListener('input', applySearchFilter);
  doc.getElementById('clear-search-btn').addEventListener('click', () => {
    searchInput.value = '';
    renderDirectory(guests);
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) openProfile(btn.getAttribute('data-id'));
  });

  function showNotFound(id) {
    tableWrap.hidden = true;
    emptyEl.hidden = true;
    notFoundEl.hidden = false;
    notFoundEl.querySelector('.nf-id').textContent = id;
  }

  doc.getElementById('nf-back-btn').addEventListener('click', () => {
    doc.getElementById('lookup-input').value = '';
    searchInput.value = '';
    renderDirectory(guests);
  });

  doc.getElementById('lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = doc.getElementById('lookup-input').value.trim();
    if (!idVal) return;
    api.get(idVal).then((guest) => {
      doc.getElementById('lookup-input').value = '';
      openProfileFromGuest(guest);
    }).catch(() => {
      showNotFound(idVal);
    });
  });

  /* ---------------- Create guest ---------------- */
  const createOverlay = doc.getElementById('create-overlay');
  const createModal = doc.getElementById('create-modal');
  const createForm = doc.getElementById('create-form');

  function clearCreateErrors() {
    doc.getElementById('error-name').hidden = true;
    doc.getElementById('error-contact').hidden = true;
    doc.getElementById('field-name').classList.remove('input-error');
    doc.getElementById('field-email').classList.remove('input-error');
    doc.getElementById('field-phone').classList.remove('input-error');
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

  doc.getElementById('new-guest-btn').addEventListener('click', openCreateModal);
  doc.getElementById('create-close-btn').addEventListener('click', closeCreateModal);
  doc.getElementById('create-cancel-btn').addEventListener('click', closeCreateModal);
  createOverlay.addEventListener('click', closeCreateModal);

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearCreateErrors();
    const name = doc.getElementById('field-name').value.trim();
    const email = doc.getElementById('field-email').value.trim();
    const phone = doc.getElementById('field-phone').value.trim();
    let valid = true;
    if (!name) {
      doc.getElementById('error-name').hidden = false;
      doc.getElementById('field-name').classList.add('input-error');
      valid = false;
    }
    if (!email && !phone) {
      doc.getElementById('error-contact').hidden = false;
      doc.getElementById('field-email').classList.add('input-error');
      doc.getElementById('field-phone').classList.add('input-error');
      valid = false;
    }
    if (!valid) return;

    const roomType = doc.getElementById('field-room').value.trim();
    const dietary = doc.getElementById('field-dietary').value.trim();
    const communication = doc.getElementById('field-comm').value;

    api.create({ name, email, phone, roomType, dietary, communication, actor: STAFF_NAME }).then((guest) => {
      guests.unshift(guest);
      closeCreateModal();
      searchInput.value = '';
      renderDirectory(guests);
      showToast(doc.getElementById('toast'), doc.getElementById('toast-message'), `Guest profile created — ID ${guest.id}`, 'directory');
    }).catch(() => {
      showToast(doc.getElementById('toast'), doc.getElementById('toast-message'), 'Guest profile could not be created — please try again', 'directory');
    });
  });

  /* ---------------- Guest Profile ---------------- */
  const profileContent = doc.getElementById('profile-content');
  const detailsViewMode = doc.getElementById('details-view-mode');
  const detailsEditMode = doc.getElementById('details-edit-mode');

  function renderProfileView(g, changedFields) {
    const changed = changedFields || [];
    profileContent.hidden = false;

    doc.getElementById('profile-name').textContent = g.name;
    doc.getElementById('profile-meta').textContent = `${g.id} · Member since ${fmtDate(g.createdAt)} · Last updated ${fmtDateTime(g.updatedAt)}`;
    doc.getElementById('profile-status-chip').innerHTML = statusChipHtml(g.status);

    doc.getElementById('deactivated-banner').hidden = g.status !== 'deactivated';
    doc.getElementById('deactivate-profile-btn').hidden = g.status !== 'active';
    doc.getElementById('reactivate-profile-btn').hidden = g.status !== 'deactivated';

    const rows = [
      ['Email', g.email || '—', 'email'],
      ['Phone', g.phone || '—', 'phone'],
      ['Room preference', g.preferences.roomType || '—', 'roomType'],
      ['Dietary notes', g.preferences.dietary || '—', 'dietary'],
      ['Preferred contact', g.preferences.communication || '—', 'communication'],
    ];
    doc.getElementById('kv-list').innerHTML = rows.map(([label, value, key]) => {
      const isChanged = changed.includes(key);
      return `<div class="kv-row${isChanged ? ' kv-row--changed' : ''}">
        <span class="kv-label">${label}</span>
        <span class="kv-value">${escapeHtml(value)}${isChanged ? '<span class="kv-updated-tag">Updated</span>' : ''}</span>
      </div>`;
    }).join('');

    const bookingsEl = doc.getElementById('booking-history');
    if (g.bookingHistory.length === 0) {
      bookingsEl.innerHTML = '<p class="no-bookings-note">No bookings on file yet.</p>';
    } else {
      bookingsEl.innerHTML = `<table class="booking-table"><thead><tr><th scope="col">Dates</th><th scope="col">Booking</th><th scope="col">Status</th></tr></thead><tbody>${
        g.bookingHistory.map((b) => `<tr><td>${escapeHtml(b.dates)}</td><td>${escapeHtml(b.item)}</td><td>${bookingStatusChipHtml(b.status)}</td></tr>`).join('')
      }</tbody></table>`;
    }

    const auditEl = doc.getElementById('audit-list');
    const entries = g.auditLog.slice().reverse();
    auditEl.innerHTML = entries.map((a) => {
      const justNow = a.ts === lastMutationTs;
      return `<li class="audit-item"><span class="audit-actor">${escapeHtml(a.actor)}</span> <span class="audit-action">${escapeHtml(a.action)}</span>${
        justNow ? '<span class="audit-just-now">Just now</span>' : ''
      }<br /><span>${fmtDateTime(a.ts)}</span></li>`;
    }).join('');
  }

  function exitEditMode() {
    detailsViewMode.hidden = false;
    detailsEditMode.hidden = true;
  }

  function openProfileFromGuest(guest) {
    currentGuest = guest;
    exitEditMode();
    renderProfileView(guest);
    directoryScreen.hidden = true;
    profileScreen.hidden = false;
  }

  function openProfile(id) {
    api.get(id).then((guest) => {
      openProfileFromGuest(guest);
    }).catch(() => {
      showNotFound(id);
    });
  }

  doc.getElementById('profile-back-btn').addEventListener('click', () => {
    exitEditMode();
    searchInput.value = '';
    renderDirectory(guests);
    profileScreen.hidden = true;
    directoryScreen.hidden = false;
  });

  function enterEditMode(g) {
    doc.getElementById('edit-name').value = g.name;
    doc.getElementById('edit-email').value = g.email || '';
    doc.getElementById('edit-phone').value = g.phone || '';
    doc.getElementById('edit-room').value = g.preferences.roomType || '';
    doc.getElementById('edit-dietary').value = g.preferences.dietary || '';
    doc.getElementById('edit-comm').value = g.preferences.communication || '';
    doc.getElementById('edit-error-name').hidden = true;
    doc.getElementById('edit-error-contact').hidden = true;
    doc.getElementById('edit-name').classList.remove('input-error');
    doc.getElementById('edit-email').classList.remove('input-error');
    doc.getElementById('edit-phone').classList.remove('input-error');
    detailsViewMode.hidden = true;
    detailsEditMode.hidden = false;
  }

  doc.getElementById('edit-profile-btn').addEventListener('click', () => {
    enterEditMode(currentGuest);
  });
  doc.getElementById('edit-cancel-btn').addEventListener('click', exitEditMode);

  doc.getElementById('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    doc.getElementById('edit-error-name').hidden = true;
    doc.getElementById('edit-error-contact').hidden = true;
    doc.getElementById('edit-name').classList.remove('input-error');
    doc.getElementById('edit-email').classList.remove('input-error');
    doc.getElementById('edit-phone').classList.remove('input-error');

    const form = {
      name: doc.getElementById('edit-name').value.trim(),
      email: doc.getElementById('edit-email').value.trim(),
      phone: doc.getElementById('edit-phone').value.trim(),
      roomType: doc.getElementById('edit-room').value.trim(),
      dietary: doc.getElementById('edit-dietary').value.trim(),
      communication: doc.getElementById('edit-comm').value,
    };

    let valid = true;
    if (!form.name) {
      doc.getElementById('edit-error-name').hidden = false;
      doc.getElementById('edit-name').classList.add('input-error');
      valid = false;
    }
    if (!form.email && !form.phone) {
      doc.getElementById('edit-error-contact').hidden = false;
      doc.getElementById('edit-email').classList.add('input-error');
      doc.getElementById('edit-phone').classList.add('input-error');
      valid = false;
    }
    if (!valid) return;

    const changes = diffChanges(currentGuest, form);

    exitEditMode();

    if (Object.keys(changes).length === 0) {
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'No changes to save', 'profile');
      renderProfileView(currentGuest);
      return;
    }

    api.update(currentGuest.id, changes).then((guest) => {
      currentGuest = guest;
      lastMutationTs = guest.auditLog[guest.auditLog.length - 1].ts;
      const idx = guests.findIndex((g) => g.id === guest.id);
      if (idx !== -1) guests[idx] = guest;
      renderProfileView(guest, Object.keys(changes));
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Profile updated', 'profile');
    }).catch(() => {
      renderProfileView(currentGuest);
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Profile could not be saved — please try again', 'profile');
    });
  });

  /* Deactivate / Reactivate */
  const deactivateOverlay = doc.getElementById('deactivate-overlay');
  const deactivateModal = doc.getElementById('deactivate-modal');
  const reactivateOverlay = doc.getElementById('reactivate-overlay');
  const reactivateModal = doc.getElementById('reactivate-modal');

  function closeDeactivateModal() { deactivateOverlay.hidden = true; deactivateModal.hidden = true; }
  function closeReactivateModal() { reactivateOverlay.hidden = true; reactivateModal.hidden = true; }

  doc.getElementById('deactivate-profile-btn').addEventListener('click', () => {
    doc.getElementById('deactivate-consequence-copy').textContent =
      `Deactivating ${currentGuest.name}'s profile marks it inactive and removes it from active guest searches. Booking history and the audit trail stay fully intact, and you can reactivate this profile anytime.`;
    deactivateOverlay.hidden = false;
    deactivateModal.hidden = false;
  });
  doc.getElementById('deactivate-close-btn').addEventListener('click', closeDeactivateModal);
  doc.getElementById('deactivate-cancel-btn').addEventListener('click', closeDeactivateModal);
  deactivateOverlay.addEventListener('click', closeDeactivateModal);

  doc.getElementById('deactivate-confirm-btn').addEventListener('click', () => {
    api.deactivate(currentGuest.id).then((guest) => {
      currentGuest = guest;
      lastMutationTs = guest.auditLog[guest.auditLog.length - 1].ts;
      const idx = guests.findIndex((g) => g.id === guest.id);
      if (idx !== -1) guests[idx] = guest;
      closeDeactivateModal();
      renderProfileView(guest);
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Guest profile deactivated', 'profile');
    }).catch(() => {
      closeDeactivateModal();
      renderProfileView(currentGuest);
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Deactivation could not be completed — please try again', 'profile');
    });
  });

  doc.getElementById('reactivate-profile-btn').addEventListener('click', () => {
    doc.getElementById('reactivate-consequence-copy').textContent =
      `Reactivating ${currentGuest.name}'s profile returns it to Active. It becomes searchable, editable, and bookable again, exactly like any other active profile.`;
    reactivateOverlay.hidden = false;
    reactivateModal.hidden = false;
  });
  doc.getElementById('reactivate-close-btn').addEventListener('click', closeReactivateModal);
  doc.getElementById('reactivate-cancel-btn').addEventListener('click', closeReactivateModal);
  reactivateOverlay.addEventListener('click', closeReactivateModal);

  doc.getElementById('reactivate-confirm-btn').addEventListener('click', () => {
    api.reactivate(currentGuest.id).then((guest) => {
      currentGuest = guest;
      lastMutationTs = guest.auditLog[guest.auditLog.length - 1].ts;
      const idx = guests.findIndex((g) => g.id === guest.id);
      if (idx !== -1) guests[idx] = guest;
      closeReactivateModal();
      renderProfileView(guest);
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Guest profile reactivated', 'profile');
    }).catch(() => {
      closeReactivateModal();
      renderProfileView(currentGuest);
      showToast(doc.getElementById('profile-toast'), doc.getElementById('profile-toast-message'), 'Reactivation could not be completed — please try again', 'profile');
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!createModal.hidden) closeCreateModal();
    if (!deactivateModal.hidden) closeDeactivateModal();
    if (!reactivateModal.hidden) closeReactivateModal();
  });

  renderDirectory(guests);
}

function createDefaultApi() {
  function jsonRequest(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) {
        return Promise.reject({ status: res.status });
      }
      return res.json();
    });
  }

  return {
    get: (id) => fetch(`/guests/${id}`).then((res) => {
      if (!res.ok) return Promise.reject({ status: res.status });
      return res.json();
    }),
    create: (data) => jsonRequest('/guests', 'POST', { ...data, actor: STAFF_NAME }),
    update: (id, changes) => jsonRequest(`/guests/${id}`, 'PATCH', { ...changes, actor: STAFF_NAME }),
    deactivate: (id) => jsonRequest(`/guests/${id}/deactivate`, 'POST', { actor: STAFF_NAME }),
    reactivate: (id) => jsonRequest(`/guests/${id}/reactivate`, 'POST', { actor: STAFF_NAME }),
  };
}

module.exports = { initGuestProfilesApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    fetch('/guests')
      .then((res) => res.json())
      .then((guests) => initGuestProfilesApp(document, guests, createDefaultApi()));
  });
}
