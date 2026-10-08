(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const DEMO_TECHNICIAN_ID = 'marcus-webb';

  const STATUS_META = {
    Assigned: { icon: '○', className: 'status-assigned' },
    Accepted: { icon: '✓', className: 'status-accepted' },
    'In Progress': { icon: '◐', className: 'status-in-progress' },
  };

  function formatTimeWindow(startIso, endIso) {
    const opts = { hour: 'numeric', minute: '2-digit' };
    const start = new Date(startIso).toLocaleTimeString(undefined, opts);
    const end = new Date(endIso).toLocaleTimeString(undefined, opts);
    return `${start} – ${end}`;
  }

  function initJobsApp(doc, api) {
    const $ = (id) => doc.getElementById(id);
    const loadingEl = $('list-loading');
    const errorEl = $('list-error');
    const emptyEl = $('job-list-empty');
    const listEl = $('job-list');
    const countEl = $('job-count');
    const liveEl = $('list-live-region');

    function setListState(next) {
      [loadingEl, errorEl, emptyEl, listEl].forEach((el) => { el.hidden = true; });
      countEl.textContent = '';
      if (next === 'loading') loadingEl.hidden = false;
      else if (next === 'error') errorEl.hidden = false;
      else if (next === 'empty') emptyEl.hidden = false;
      else listEl.hidden = false;
    }

    function statusChipHTML(status) {
      const meta = STATUS_META[status] || STATUS_META.Assigned;
      return `<span class="status-chip ${meta.className}"><span aria-hidden="true">${meta.icon}</span>${escapeHtml(doc, status)}</span>`;
    }

    function photoSectionHTML(job) {
      if (!job.photos || job.photos.length === 0) return '';
      const thumbs = job.photos.map((p) => (
        '<div class="photo-thumb-wrap">'
        + `<img class="photo-thumb" src="${escapeHtml(doc, p.url)}" alt="Customer photo: ${escapeHtml(doc, p.caption)}" data-caption="${escapeHtml(doc, p.caption)}" />`
        + `<span class="photo-caption">${escapeHtml(doc, p.caption)}</span>`
        + '</div>'
      )).join('');
      return `<div class="photo-section"><p class="job-description-label">Customer photos</p><div class="photo-strip">${thumbs}</div></div>`;
    }

    function jobCardHTML(job) {
      const category = job.serviceCategory
        ? `<div class="job-category-row"><span class="chip">${escapeHtml(doc, job.serviceCategory)}</span></div>`
        : '';
      return `<div class="job-card" data-id="${escapeHtml(doc, job.id)}">`
        + '<div class="job-card-head">'
        + `<p class="job-time">${escapeHtml(doc, formatTimeWindow(job.scheduledStart, job.scheduledEnd))}</p>`
        + statusChipHTML(job.status)
        + '</div>'
        + `<p class="job-customer">${escapeHtml(doc, job.customerName)}</p>`
        + `<p class="job-address">${escapeHtml(doc, job.address)}</p>`
        + category
        + '<p class="job-description-label">Reported problem</p>'
        + `<p class="job-description">${escapeHtml(doc, job.problemDescription)}</p>`
        + photoSectionHTML(job)
        + '</div>';
    }

    function replaceWithBroken(img) {
      const broken = doc.createElement('div');
      broken.className = 'photo-thumb-broken';
      broken.setAttribute('role', 'img');
      broken.setAttribute('aria-label', `${img.dataset.caption} — photo unavailable`);
      broken.textContent = '🖼';
      img.replaceWith(broken);
    }

    function renderJobList(jobs) {
      listEl.innerHTML = jobs.map(jobCardHTML).join('');
      listEl.querySelectorAll('img.photo-thumb').forEach((img) => {
        img.addEventListener('error', () => replaceWithBroken(img));
      });
      countEl.textContent = `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`;
    }

    function load() {
      setListState('loading');
      return api.list().then((jobs) => {
        if (jobs.length === 0) {
          setListState('empty');
          countEl.textContent = '0 jobs';
          liveEl.textContent = 'No jobs assigned.';
          return;
        }
        setListState('success');
        renderJobList(jobs);
        liveEl.textContent = 'Jobs loaded.';
      }).catch(() => {
        setListState('error');
      });
    }

    $('list-retry').addEventListener('click', load);
    return load();
  }

  function createDefaultApi() {
    return {
      list: () => fetch('/jobs', { headers: { 'x-user-id': DEMO_TECHNICIAN_ID } })
        .then((res) => res.json().catch(() => ([])).then((data) => (
          res.ok ? data : Promise.reject({ status: res.status })
        ))),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initJobsApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initJobsApp(document, createDefaultApi());
    });
  }
}());
