(function () {
  const { formatDateDisplay, statusBadgeMarkup } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  function isAccessDenied(err) {
    return Boolean(err && (err.status === 401 || err.status === 403));
  }

  function initEmployeeRecordApp(doc, employeeId, api) {
    const $ = (id) => doc.getElementById(id);
    const panels = ['profile-denied', 'profile-notfound', 'profile-authorized'];

    function showPanel(active) {
      panels.forEach((id) => { $(id).hidden = id !== active; });
    }

    function setText(id, value) {
      $(id).textContent = value || '—';
    }

    function render(e) {
      setText('profile-name', e.name);
      setText('profile-role-line', `${e.role} · ${e.department}`);
      setText('profile-id', e.id);
      setText('profile-email', e.email);
      setText('profile-department', e.department);
      setText('profile-role', e.role);
      $('profile-start-date').textContent = formatDateDisplay(e.startDate);
      $('profile-status-chip').innerHTML = statusBadgeMarkup(e.employmentStatus);
      showPanel('profile-authorized');
    }

    function load() {
      if (!employeeId) {
        showPanel('profile-notfound');
        return Promise.resolve();
      }
      $('profile-name').textContent = 'Loading…';
      return Promise.resolve(api.getProfile()).then(render, (err) => {
        if (isAccessDenied(err)) showPanel('profile-denied');
        else if (err && err.status === 404) showPanel('profile-notfound');
        else {
          $('profile-name').textContent = 'Could not load this record';
          showPanel('profile-authorized');
        }
      });
    }

    $('profile-back-btn').addEventListener('click', () => { doc.defaultView.location.href = 'employee-directory.html'; });
    const roleSelect = $('role-select');
    if (roleSelect) roleSelect.addEventListener('change', load);

    return load();
  }

  function createDefaultApi(employeeId, getRole = () => 'hr') {
    return {
      getProfile: () => {
        const headers = { 'Content-Type': 'application/json' };
        if (getRole() !== 'signedout') headers['x-staff-role'] = getRole();
        return fetch(`/employees/${encodeURIComponent(employeeId)}`, { method: 'GET', headers })
          .then((res) => res.json().catch(() => ({})).then((data) => (
            res.ok ? data : Promise.reject({ status: res.status, ...data })
          )));
      },
    };
  }

  if (typeof module !== 'undefined') module.exports = { initEmployeeRecordApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const roleSelect = document.getElementById('role-select');
      const getRole = () => roleSelect.value;
      const employeeId = new URLSearchParams(window.location.search).get('id');
      initEmployeeRecordApp(document, employeeId, createDefaultApi(employeeId, getRole));
    });
  }
}());
