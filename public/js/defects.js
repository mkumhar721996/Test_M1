(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const STATUS_META = {
    New: { icon: '●', className: 'status-new' },
    'In Progress': { icon: '◐', className: 'status-in-progress' },
    Resolved: { icon: '✓', className: 'status-resolved' },
    Closed: { icon: '✕', className: 'status-closed' },
  };

  const SCREEN_LIST = 0;
  const SCREEN_FORM = 1;
  const SCREEN_DETAIL = 2;
  const REPORTER = 'Jordan Lee';
  // No real sign-in exists yet; every request identifies as this user.
  const DEMO_USER_ID = 'jordan-lee';

  const POLL_INTERVAL_MS = 5000;
  const DETAIL_HASH = /^#\/defects\/(.+)$/;
  const NOT_FOUND_MESSAGE = "That defect doesn't exist, or it isn't in a project you belong to.";

  function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function initDefectsApp(doc, api) {
    const win = doc.defaultView;
    const $ = (id) => doc.getElementById(id);
    const screens = Array.from(doc.querySelectorAll('.screen'));
    const listEl = $('defect-list');
    const form = $('defect-form');
    const titleInput = $('field-title');
    const titleError = $('title-error');
    const formBanner = $('form-error-banner');
    const submitBtn = $('submit-defect');
    const paginationEl = $('list-pagination');

    const listPanels = ['list-loading', 'list-error', 'list-signed-out', 'defect-list-empty'].map($);
    const detailPanels = ['detail-loading', 'detail-error', 'detail-signed-out', 'detail-not-found', 'detail-success'].map($);

    let currentScreen = SCREEN_LIST;
    let listPage = 1;
    let detailId = null;
    let lastSeen = new Map();
    let justUpdatedIds = new Set();

    function show(index) {
      currentScreen = index;
      screens.forEach((s, i) => { s.style.display = i === index ? 'block' : 'none'; });
    }

    function metaFor(status) {
      return STATUS_META[status] || { icon: '', className: '' };
    }

    function statusChipHTML(status) {
      return `<span class="icon" aria-hidden="true">${metaFor(status).icon}</span>${escapeHtml(doc, status)}`;
    }

    function fieldValueHTML(value) {
      return value ? escapeHtml(doc, value) : '<em>Not provided</em>';
    }

    function showOnly(panels, visible) {
      panels.forEach((el) => { el.hidden = el !== visible; });
    }

    // ---------- List ----------
    function setListState(panel) {
      showOnly(listPanels, panel);
      listEl.hidden = Boolean(panel);
      if (panel) paginationEl.hidden = true;
      if (panel) listEl.innerHTML = '';
    }

    function renderPagination(page, totalPages) {
      if (totalPages <= 1) { paginationEl.hidden = true; return; }
      paginationEl.hidden = false;
      paginationEl.innerHTML = `<button type="button" id="pg-prev" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">← Prev</button>`
        + `<span class="pagination-status">Page ${page} of ${totalPages}</span>`
        + `<button type="button" id="pg-next" ${page >= totalPages ? 'disabled' : ''} aria-label="Next page">Next →</button>`;
      $('pg-prev').addEventListener('click', () => loadList({ page: page - 1 }));
      $('pg-next').addEventListener('click', () => loadList({ page: page + 1 }));
    }

    function renderList(result) {
      const items = result.items || [];
      listPage = result.page || 1;
      if (items.length === 0) {
        setListState($('defect-list-empty'));
        lastSeen = new Map();
        return;
      }
      setListState(null);
      listEl.innerHTML = items.map((d) => {
        const rowClass = justUpdatedIds.has(d.id) ? 'defect-row just-updated' : 'defect-row';
        const where = d.projectName ? ` · ${escapeHtml(doc, d.projectName)}` : '';
        return `<div class="${rowClass}" data-id="${escapeHtml(doc, d.id)}">`
          + '<div class="defect-row-main">'
          + `<button type="button" class="defect-row-title" data-id="${escapeHtml(doc, d.id)}">${escapeHtml(doc, d.title)}</button>`
          + `<span class="defect-row-meta">${escapeHtml(doc, d.id)}${where}</span>`
          + '</div>'
          + '<div class="defect-row-right">'
          + `<span class="defect-row-updated">${d.updatedAt ? `Updated ${escapeHtml(doc, formatDateTime(d.updatedAt))}` : ''}</span>`
          + `<span class="status-chip ${metaFor(d.status).className}">${statusChipHTML(d.status)}</span>`
          + '</div>'
          + '</div>';
      }).join('');
      listEl.querySelectorAll('.defect-row-title').forEach((btn) => {
        btn.addEventListener('click', () => { win.location.hash = `#/defects/${encodeURIComponent(btn.dataset.id)}`; });
      });
      renderPagination(listPage, result.totalPages || 1);
    }

    async function loadList({ page = listPage, silent = false } = {}) {
      if (!silent) setListState($('list-loading'));
      try {
        const result = await api.list(page);
        justUpdatedIds = new Set();
        if (silent) {
          (result.items || []).forEach((d) => {
            const prev = lastSeen.get(d.id);
            if (prev && prev !== `${d.status}|${d.updatedAt}`) justUpdatedIds.add(d.id);
          });
        }
        lastSeen = new Map((result.items || []).map((d) => [d.id, `${d.status}|${d.updatedAt}`]));
        renderList(result);
        if (justUpdatedIds.size) {
          const changed = (result.items || []).filter((d) => justUpdatedIds.has(d.id));
          $('list-live-region').textContent = changed.map((d) => `${d.id} (${d.title}) was just updated to ${d.status}.`).join(' ');
        }
      } catch (err) {
        if (err && err.status === 401) setListState($('list-signed-out'));
        else if (!silent) setListState($('list-error'));
      }
    }

    // ---------- Detail ----------
    function setField(id, value) {
      const el = $(id);
      el.innerHTML = fieldValueHTML(value);
      el.className = value ? '' : 'not-provided';
    }

    function renderDetail(defect) {
      $('detail-id').textContent = defect.id;
      $('detail-title').textContent = defect.title;
      const chip = $('detail-status-chip');
      chip.className = `status-chip ${metaFor(defect.status).className}`;
      chip.innerHTML = statusChipHTML(defect.status);
      $('detail-reported-meta').textContent = `Reported by ${defect.reportedBy || 'Unknown'} on ${defect.reportedAt}`;
      $('detail-updated-meta').textContent = defect.updatedAt
        ? `Last updated by ${defect.updatedBy || 'Unknown'} on ${formatDateTime(defect.updatedAt)}`
        : '';
      setField('detail-project', defect.projectName);
      setField('detail-description', defect.description);
      setField('detail-steps', defect.steps);
      setField('detail-environment', defect.environment);
      setField('detail-severity', defect.severity);
      showOnly(detailPanels, $('detail-success'));
    }

    async function loadDetail(id, { silent = false } = {}) {
      if (!silent) showOnly(detailPanels, $('detail-loading'));
      try {
        const defect = await api.get(id);
        if (id !== detailId) return;
        renderDetail(defect);
      } catch (err) {
        if (id !== detailId) return;
        if (err && err.status === 404) showOnly(detailPanels, $('detail-not-found'));
        else if (err && err.status === 401) showOnly(detailPanels, $('detail-signed-out'));
        else if (!silent) showOnly(detailPanels, $('detail-error'));
      }
    }

    function openDetail(id) {
      detailId = id;
      show(SCREEN_DETAIL);
      return loadDetail(id);
    }

    function goToList() {
      detailId = null;
      if (win.location.hash !== '#/defects') win.location.hash = '#/defects';
      show(SCREEN_LIST);
      return loadList({ page: listPage });
    }

    // ---------- Routing ----------
    function handleRoute() {
      const match = win.location.hash.match(DETAIL_HASH);
      if (match) {
        const id = decodeURIComponent(match[1]);
        if (id !== detailId || currentScreen !== SCREEN_DETAIL) openDetail(id);
      } else if (currentScreen === SCREEN_DETAIL) {
        detailId = null;
        show(SCREEN_LIST);
        loadList({ page: listPage });
      }
    }

    // ---------- Create ----------
    function clearErrors() {
      titleInput.classList.remove('has-error');
      titleError.hidden = true;
      formBanner.hidden = true;
    }

    function resetForm() {
      form.reset();
      clearErrors();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.classList.add('has-error');
        titleError.hidden = false;
        formBanner.hidden = false;
        titleInput.focus();
        return;
      }
      clearErrors();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging defect…';
      try {
        const created = await api.create({
          title,
          description: $('field-description').value.trim(),
          steps: $('field-steps').value.trim(),
          environment: $('field-environment').value.trim(),
          severity: $('field-severity').value,
          reportedBy: REPORTER,
        });
        resetForm();
        detailId = created.id;
        renderDetail(created);
        show(SCREEN_DETAIL);
        win.location.hash = `#/defects/${encodeURIComponent(created.id)}`;
        await loadList({ page: 1 });
      } catch (err) {
        formBanner.hidden = false;
        if (err && err.fields && err.fields.title) {
          titleInput.classList.add('has-error');
          titleError.hidden = false;
          titleInput.focus();
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log defect';
      }
    });

    $('cancel-defect').addEventListener('click', () => { resetForm(); show(SCREEN_LIST); });
    $('go-to-form').addEventListener('click', () => show(SCREEN_FORM));
    $('go-to-form-from-empty').addEventListener('click', () => show(SCREEN_FORM));
    $('back-to-list').addEventListener('click', goToList);
    $('not-found-back').addEventListener('click', goToList);
    $('log-another').addEventListener('click', () => { resetForm(); show(SCREEN_FORM); });
    $('list-retry').addEventListener('click', () => loadList({ page: listPage }));
    $('detail-retry').addEventListener('click', () => { if (detailId) loadDetail(detailId); });
    win.addEventListener('hashchange', handleRoute);

    // AC3: keep whichever view is on screen current without a manual refresh.
    win.setInterval(() => {
      if (currentScreen === SCREEN_LIST) loadList({ silent: true });
      else if (currentScreen === SCREEN_DETAIL && detailId) loadDetail(detailId, { silent: true });
    }, POLL_INTERVAL_MS);

    show(SCREEN_LIST);
    const initial = win.location.hash.match(DETAIL_HASH);
    if (initial) {
      handleRoute();
    } else {
      loadList({ page: 1 });
    }
  }

  function createDefaultApi() {
    function request(url, method, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json', 'x-user-id': DEMO_USER_ID } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts)
        .then((res) => res.json().catch(() => ({})).then((data) => (
          res.ok ? data : Promise.reject({ status: res.status, ...data })
        )));
    }

    return {
      list: (page = 1) => request(`/defects?page=${encodeURIComponent(page)}`, 'GET'),
      get: (id) => request(`/defects/${encodeURIComponent(id)}`, 'GET'),
      create: (payload) => request('/defects', 'POST', payload),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initDefectsApp, createDefaultApi, POLL_INTERVAL_MS };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initDefectsApp(document, createDefaultApi());
    });
  }
}());
