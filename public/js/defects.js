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

  function initDefectsApp(doc, initialDefects, api) {
    const defects = initialDefects.slice();
    const $ = (id) => doc.getElementById(id);
    const screens = Array.from(doc.querySelectorAll('.screen'));
    const listEl = $('defect-list');
    const listEmptyEl = $('defect-list-empty');
    const form = $('defect-form');
    const titleInput = $('field-title');
    const titleError = $('title-error');
    const formBanner = $('form-error-banner');
    const submitBtn = $('submit-defect');

    function show(index) {
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

    function renderList() {
      if (defects.length === 0) {
        listEl.style.display = 'none';
        listEmptyEl.hidden = false;
        return;
      }
      listEmptyEl.hidden = true;
      listEl.style.display = '';
      listEl.innerHTML = defects.map((d, idx) => (
        '<div class="defect-row">'
        + '<div class="defect-row-main">'
        + `<button type="button" class="defect-row-title" data-idx="${idx}">${escapeHtml(doc, d.title)}</button>`
        + `<span class="defect-row-meta">${escapeHtml(doc, d.id)} · Reported by ${escapeHtml(doc, d.reportedBy)} on ${escapeHtml(doc, d.reportedAt)}</span>`
        + '</div>'
        + '<div class="defect-row-right">'
        + `<span class="status-chip ${metaFor(d.status).className}">${statusChipHTML(d.status)}</span>`
        + '</div>'
        + '</div>'
      )).join('');
      listEl.querySelectorAll('.defect-row-title').forEach((btn) => {
        btn.addEventListener('click', () => showDetail(defects[Number(btn.dataset.idx)]));
      });
    }

    function setField(id, value) {
      const el = $(id);
      el.innerHTML = fieldValueHTML(value);
      el.className = value ? '' : 'not-provided';
    }

    function showDetail(defect) {
      $('detail-id').textContent = defect.id;
      $('detail-title').textContent = defect.title;
      const chip = $('detail-status-chip');
      chip.className = `status-chip ${metaFor(defect.status).className}`;
      chip.innerHTML = statusChipHTML(defect.status);
      $('detail-meta').textContent = `Reported by ${defect.reportedBy} on ${defect.reportedAt}`;
      setField('detail-description', defect.description);
      setField('detail-steps', defect.steps);
      setField('detail-environment', defect.environment);
      setField('detail-severity', defect.severity);
      show(SCREEN_DETAIL);
    }

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
        defects.unshift(created);
        renderList();
        resetForm();
        showDetail(created);
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
    $('back-to-list').addEventListener('click', () => show(SCREEN_LIST));
    $('log-another').addEventListener('click', () => { resetForm(); show(SCREEN_FORM); });

    renderList();
    show(SCREEN_LIST);
  }

  function createDefaultApi() {
    function request(url, method, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts)
        .then((res) => res.json().catch(() => ({})).then((data) => (
          res.ok ? data : Promise.reject({ status: res.status, ...data })
        )));
    }

    return {
      list: () => request('/defects', 'GET'),
      create: (payload) => request('/defects', 'POST', payload),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initDefectsApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const api = createDefaultApi();
      api.list().then((defects) => initDefectsApp(document, defects, api));
    });
  }
}());
