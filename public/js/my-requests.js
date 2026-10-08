(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const OPEN_STATUSES = ['Submitted', 'Assigned', 'In Progress'];
  const PAST_STATUSES = ['Completed', 'Cancelled'];
  const TRACK_STEPS = ['Submitted', 'Assigned', 'In Progress', 'Completed'];

  const STATUS_META = {
    Submitted: { icon: '○', className: 'status-submitted' },
    Assigned: { icon: '◐', className: 'status-assigned' },
    'In Progress': { icon: '◉', className: 'status-in-progress' },
    Completed: { icon: '✓', className: 'status-completed' },
    Cancelled: { icon: '✕', className: 'status-cancelled' },
  };

  const SCREEN_LIST = 0;
  const SCREEN_DETAIL = 1;
  const DETAIL_HASH = /^#\/requests\/(.+)$/;
  // No real sign-in exists yet; every request identifies as this customer.
  const DEMO_CUSTOMER_ID = 'cust_jordan';
  const DEMO_CUSTOMER_NAME = 'Jordan Ellis';

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  function formatAddress(address) {
    if (!address || typeof address !== 'object') return address || '';
    const street = [address.street, address.unit].filter(Boolean).join(', ');
    return [street, address.city, [address.state, address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  function initMyRequestsApp(doc, api) {
    const win = doc.defaultView;
    const $ = (id) => doc.getElementById(id);
    const esc = (v) => escapeHtml(doc, v);
    const screens = Array.from(doc.querySelectorAll('.screen'));
    const listPanels = ['list-loading', 'list-error', 'list-empty', 'list-success'].map($);

    let detailId = null;
    let currentScreen = SCREEN_LIST;

    function show(index) {
      currentScreen = index;
      screens.forEach((s, i) => { s.style.display = i === index ? 'block' : 'none'; });
    }

    function showOnly(panel) {
      listPanels.forEach((el) => { el.hidden = el !== panel; });
    }

    function statusChipHTML(status) {
      const meta = STATUS_META[status] || { icon: '', className: '' };
      return `<span class="status-chip ${meta.className}"><span aria-hidden="true">${meta.icon}</span>${esc(status)}</span>`;
    }

    function techLineHTML(request) {
      if (request.technician) {
        return `<span class="tech-line"><span class="icon" aria-hidden="true">👤</span>Assigned to ${esc(request.technician)}</span>`;
      }
      return '<span class="no-tech-line"><span class="icon" aria-hidden="true">–</span>Not yet assigned</span>';
    }

    function requestCardHTML(request, isPast) {
      return `<button type="button" class="request-card${isPast ? ' is-past' : ''}" data-view-request="${esc(request.id)}">`
        + '<div class="request-card-head">'
        + `<div><p class="request-card-title">${esc(request.category)}</p><p class="request-card-id">${esc(request.id)}</p></div>`
        + `<span>${statusChipHTML(request.status)}</span>`
        + '</div>'
        + `<p class="request-card-desc">${esc(request.description)}</p>`
        + `<div class="request-card-meta">${techLineHTML(request)}<span aria-hidden="true">·</span><span>Submitted ${esc(formatDate(request.submittedAt))}</span></div>`
        + '</button>';
    }

    // ---------- List ----------
    function renderList(requests) {
      $('request-count').textContent = `${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`;
      if (requests.length === 0) {
        showOnly($('list-empty'));
        return;
      }
      const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
      const past = requests.filter((r) => PAST_STATUSES.includes(r.status));
      $('open-heading').hidden = open.length === 0;
      $('request-list').innerHTML = open.map((r) => requestCardHTML(r, false)).join('');
      $('past-heading').hidden = past.length === 0;
      $('past-request-list').innerHTML = past.map((r) => requestCardHTML(r, true)).join('');
      doc.querySelectorAll('[data-view-request]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.viewRequest;
          win.location.hash = `#/requests/${encodeURIComponent(id)}`;
          openDetail(id);
        });
      });
      showOnly($('list-success'));
      $('list-live-region').textContent = 'Requests loaded.';
    }

    async function loadList() {
      showOnly($('list-loading'));
      $('request-count').textContent = '';
      try {
        renderList(await api.list());
      } catch (err) {
        showOnly($('list-error'));
      }
    }

    // ---------- Detail ----------
    function renderTracker(status) {
      const trackerEl = $('detail-tracker');
      const cancelledEl = $('detail-cancelled-banner');
      if (status === 'Cancelled') {
        trackerEl.innerHTML = '';
        cancelledEl.innerHTML = '<div class="cancelled-banner"><span class="icon" aria-hidden="true">✕</span>'
          + '<span><strong>This request was cancelled.</strong> It will not move further through dispatch or job assignment.</span></div>';
        return;
      }
      cancelledEl.innerHTML = '';
      const currentIndex = TRACK_STEPS.indexOf(status);
      trackerEl.innerHTML = `<div class="status-track">${TRACK_STEPS.map((step, i) => {
        const stepClass = i < currentIndex ? 'done' : (i === currentIndex ? 'current' : '');
        const dot = i < currentIndex ? '✓' : String(i + 1);
        const connector = i < TRACK_STEPS.length - 1
          ? `<div class="status-track-connector${i < currentIndex ? ' done' : ''}"></div>`
          : '';
        return `<div class="status-track-step ${stepClass}"><div class="status-track-dot" aria-hidden="true">${dot}</div>`
          + `<span class="status-track-label">${esc(step)}</span></div>${connector}`;
      }).join('')}</div>`;
    }

    function renderDetail(request) {
      $('detail-category').textContent = request.category;
      $('detail-id').textContent = request.id;
      $('detail-status-chip').innerHTML = statusChipHTML(request.status);
      renderTracker(request.status);

      $('detail-tech-slot').innerHTML = request.technician
        ? `<div class="tech-card"><div class="tech-avatar" aria-hidden="true">${esc(request.technician.split(' ').map((p) => p[0]).join(''))}</div>`
          + `<div><p class="tech-name">${esc(request.technician)}</p><p class="tech-role">Assigned technician</p></div></div>`
        : '<div class="no-tech-card"><span class="icon" aria-hidden="true">–</span><span>Not yet assigned to a technician. You\'ll see their name here as soon as dispatch assigns one.</span></div>';

      $('detail-window-section').hidden = !request.scheduledWindow;
      $('detail-window').textContent = request.scheduledWindow || '';
      $('detail-description').textContent = request.description;
      $('detail-address').textContent = formatAddress(request.address);

      let submitted = formatDateTime(request.submittedAt);
      if (request.status === 'Completed' && request.completedAt) {
        submitted += ` · Completed ${formatDateTime(request.completedAt)}`;
      }
      if (request.status === 'Cancelled' && request.cancelledAt) {
        submitted += ` · Cancelled ${formatDateTime(request.cancelledAt)}${request.cancelReason ? ` — ${request.cancelReason}` : ''}`;
      }
      $('detail-submitted').textContent = submitted;
    }

    async function openDetail(id) {
      detailId = id;
      show(SCREEN_DETAIL);
      try {
        const request = await api.get(id);
        if (id === detailId) renderDetail(request);
      } catch (err) {
        if (id === detailId) goToList();
      }
    }

    function goToList() {
      detailId = null;
      if (win.location.hash !== '#/requests') win.location.hash = '#/requests';
      show(SCREEN_LIST);
      return loadList();
    }

    function handleRoute() {
      const match = win.location.hash.match(DETAIL_HASH);
      if (match) {
        const id = decodeURIComponent(match[1]);
        if (id !== detailId || currentScreen !== SCREEN_DETAIL) openDetail(id);
      } else if (currentScreen === SCREEN_DETAIL) {
        goToList();
      }
    }

    $('back-to-list').addEventListener('click', (e) => { e.preventDefault(); goToList(); });
    $('list-retry').addEventListener('click', loadList);
    win.addEventListener('hashchange', handleRoute);

    $('session-line').textContent = `Signed in as ${DEMO_CUSTOMER_NAME}`;
    $('session-line-detail').textContent = `Signed in as ${DEMO_CUSTOMER_NAME}`;
    show(SCREEN_LIST);
    if (win.location.hash.match(DETAIL_HASH)) handleRoute();
    else loadList();
  }

  function createDefaultApi() {
    const request = (url) => fetch(url, { headers: { 'x-customer-id': DEMO_CUSTOMER_ID } })
      .then((res) => res.json().catch(() => ({})).then((data) => (res.ok ? data : Promise.reject({ status: res.status }))));
    return {
      list: () => request('/repair-requests/mine'),
      get: (id) => request(`/repair-requests/mine/${encodeURIComponent(id)}`),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initMyRequestsApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initMyRequestsApp(document, createDefaultApi());
    });
  }
}());
