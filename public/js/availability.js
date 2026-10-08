(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const DEMO_TECHNICIAN_ID = 'marcus-webb';

  function formatDay(iso) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTimeRange(startIso, endIso) {
    const opts = { hour: 'numeric', minute: '2-digit' };
    return `${new Date(startIso).toLocaleTimeString(undefined, opts)} – ${new Date(endIso).toLocaleTimeString(undefined, opts)}`;
  }

  function initAvailabilityApp(doc, api) {
    const $ = (id) => doc.getElementById(id);
    const sw = $('avail-switch');
    const line = $('switch-status-line');
    const live = $('avail-live-region');
    const toast = $('avail-toast');
    let current = true;
    let toastTimer = null;

    function showToast(message) {
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    function renderStatus(available) {
      current = available;
      sw.setAttribute('aria-checked', String(available));
      $('switch-text-label').textContent = available ? 'On' : 'Off';
      $('status-card').classList.toggle('is-unavailable', !available);
      $('status-icon').textContent = available ? '✓' : '⏸';
      $('status-heading').textContent = available ? "You're available for new jobs" : "You're marked unavailable";
      $('status-sub').textContent = available
        ? 'Dispatch can assign you new jobs right now.'
        : "Dispatch can see you're unavailable. Jobs already on your schedule are unaffected.";
    }

    function loadStatus() {
      $('status-loading').hidden = false;
      $('status-card-wrap').hidden = true;
      $('status-error-banner').hidden = true;
      return api.getStatus().then((record) => {
        renderStatus(record.available);
        $('status-loading').hidden = true;
        $('status-card-wrap').hidden = false;
      }).catch(() => {
        $('status-loading').hidden = true;
        $('status-error-banner').hidden = false;
        live.textContent = "Couldn't load your availability.";
      });
    }

    function toggle() {
      const next = !current;
      sw.disabled = true;
      $('save-error-banner').hidden = true;
      line.textContent = 'Saving…';
      return api.setStatus(next).then((record) => {
        sw.disabled = false;
        renderStatus(record.available);
        line.textContent = record.available ? "Saved — you're available." : "Saved — you're unavailable.";
        live.textContent = record.available ? "You're now available for new jobs." : "You're now unavailable for new jobs.";
        showToast(record.available ? "You're now available" : "You're now unavailable");
      }).catch(() => {
        sw.disabled = false;
        line.textContent = '';
        $('save-error-banner').hidden = false;
        live.textContent = "Couldn't update your availability.";
      });
    }

    function setAssignmentsState(next) {
      $('assignments-loading').hidden = next !== 'loading';
      $('assignments-error').hidden = next !== 'error';
      $('assignments-empty').hidden = next !== 'empty';
      $('assignments-list-wrap').hidden = next !== 'success';
    }

    function assignmentHTML(job) {
      const accepted = job.status === 'Accepted';
      return '<div class="assignment-item">'
        + '<div class="assignment-main">'
        + `<span class="assignment-time">${escapeHtml(doc, formatDay(job.scheduledStart))} · ${escapeHtml(doc, formatTimeRange(job.scheduledStart, job.scheduledEnd))}</span>`
        + `<span class="assignment-customer">${escapeHtml(doc, job.customerName)}</span>`
        + `<span class="assignment-address">${escapeHtml(doc, job.address)}</span>`
        + '</div>'
        + `<span class="status-chip ${accepted ? 'status-accepted' : 'status-assigned'}"><span aria-hidden="true">${accepted ? '✓' : '○'}</span>${escapeHtml(doc, job.status)}</span>`
        + '</div>';
    }

    function loadAssignments() {
      setAssignmentsState('loading');
      return api.listAssignments().then((jobs) => {
        if (jobs.length === 0) {
          setAssignmentsState('empty');
          return;
        }
        $('assignments-list').innerHTML = jobs.map(assignmentHTML).join('');
        setAssignmentsState('success');
      }).catch(() => setAssignmentsState('error'));
    }

    sw.addEventListener('click', toggle);
    $('save-retry-btn').addEventListener('click', toggle);
    $('status-retry-btn').addEventListener('click', loadStatus);
    $('assignments-retry-btn').addEventListener('click', loadAssignments);
    return loadStatus().then(loadAssignments);
  }

  function request(path, options) {
    return fetch(path, options).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status })
    )));
  }

  function createDefaultApi() {
    const headers = { 'x-user-id': DEMO_TECHNICIAN_ID };
    return {
      getStatus: () => request('/availability/me', { headers }),
      setStatus: (available) => request('/availability/me', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ available }),
      }),
      listAssignments: () => request('/jobs', { headers }),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initAvailabilityApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initAvailabilityApp(document, createDefaultApi());
    });
  }
}());
