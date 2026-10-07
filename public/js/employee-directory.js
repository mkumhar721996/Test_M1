(function () {
  const { escapeHtml, statusBadgeMarkup } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;

  const RESULTS_PAGE_SIZE = 8;
  const DENIED_COPY = {
    401: 'You must be signed in as HR or Manager to view the employee directory or run a search.',
    403: 'You need the HR or Manager role to view the employee directory or run a search.',
  };

  function initEmployeeDirectoryApp(doc, api, getRole, onViewEmployee = () => {}) {
    let employees = [];

    const $ = (id) => doc.getElementById(id);
    const tbody = $('directory-tbody');
    const summary = $('results-summary');
    const partialNote = $('partial-note');
    const searchInput = $('search-input');
    const deptFilter = $('department-filter');
    const roleFilter = $('role-filter');
    const lookupInput = $('lookup-id-input');
    const lookupError = $('lookup-id-error');

    function showAccess(allowed, status) {
      $('directory-denied').hidden = allowed;
      $('directory-authorized').hidden = !allowed;
      if (!allowed) $('directory-denied-text').textContent = DENIED_COPY[status] || DENIED_COPY[403];
    }

    function renderSkeleton() {
      partialNote.hidden = true;
      tbody.innerHTML = Array.from({ length: 4 }, () => `<tr class="skeleton-row">
        <td><div class="skeleton-bar" style="width:70%;"></div></td>
        <td><div class="skeleton-bar" style="width:55%;"></div></td>
        <td><div class="skeleton-bar" style="width:35%;"></div></td>
      </tr>`).join('');
      summary.textContent = 'Loading…';
    }

    function fillOptions(select, values) {
      const first = select.options[0];
      select.innerHTML = '';
      select.appendChild(first);
      [...new Set(values)].sort().forEach((v) => {
        const opt = doc.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });
    }

    function matchingEmployees() {
      const search = searchInput.value.trim().toLowerCase();
      const dept = deptFilter.value;
      const role = roleFilter.value;
      return employees.filter((e) => (
        (!search || String(e.name).toLowerCase().includes(search))
        && (dept === 'all' || e.department === dept)
        && (role === 'all' || e.role === role)
      ));
    }

    function renderList() {
      const matches = matchingEmployees();
      const shown = matches.slice(0, RESULTS_PAGE_SIZE);
      partialNote.hidden = true;

      if (matches.length === 0) {
        summary.textContent = `Showing 0 of ${employees.length} employees`;
        tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">
          <span class="state-icon" aria-hidden="true">🔍</span>
          <p>No employees match your search or filters.</p>
          <button type="button" class="btn btn-secondary" id="empty-clear-btn">Clear filters</button>
        </div></td></tr>`;
        $('empty-clear-btn').addEventListener('click', clearFilters);
        return;
      }

      if (matches.length > RESULTS_PAGE_SIZE) {
        summary.textContent = `Showing ${shown.length} of ${matches.length} matching employees`;
        $('partial-note-text').textContent = `Only the first ${RESULTS_PAGE_SIZE} matches are shown. Add a search term or choose a department/role filter to narrow this down.`;
        partialNote.hidden = false;
      } else {
        summary.textContent = `Showing ${shown.length} of ${employees.length} employees`;
      }

      tbody.innerHTML = shown.map((e) => {
        const id = escapeHtml(doc, e.id);
        return `<tr>
          <td class="name-cell"><button type="button" class="person-name-link" data-view-id="${id}">${escapeHtml(doc, e.name)}</button><span class="person-id">${id}</span></td>
          <td class="role-cell"><span class="role-line">${escapeHtml(doc, e.role)}</span><br/><span class="dept-line">${escapeHtml(doc, e.department)}</span></td>
          <td>${statusBadgeMarkup(e.employmentStatus)}</td>
        </tr>`;
      }).join('');
    }

    function clearFilters() {
      searchInput.value = '';
      deptFilter.value = 'all';
      roleFilter.value = 'all';
      lookupError.hidden = true;
      renderList();
    }

    function renderError() {
      summary.textContent = '';
      tbody.innerHTML = `<tr><td colspan="3"><div class="error-state">
        <span class="state-icon" aria-hidden="true">⚠</span>
        <p>Something went wrong loading the directory. Your search and filters weren't lost.</p>
        <button type="button" class="btn btn-secondary" id="retry-search-btn">Retry</button>
      </div></td></tr>`;
      $('retry-search-btn').addEventListener('click', load);
    }

    function load() {
      renderSkeleton();
      return Promise.resolve(api.list()).then((list) => {
        employees = list;
        fillOptions(deptFilter, employees.map((e) => e.department));
        fillOptions(roleFilter, employees.map((e) => e.role));
        showAccess(true);
        renderList();
      }, (err) => {
        employees = [];
        if (err && (err.status === 401 || err.status === 403)) {
          showAccess(false, err.status);
          return;
        }
        showAccess(true);
        renderError();
      });
    }

    function lookup() {
      lookupError.hidden = true;
      const id = lookupInput.value.trim();
      if (!id) {
        lookupError.textContent = 'Enter an employee ID to look up.';
        lookupError.hidden = false;
        return;
      }
      const found = employees.find((e) => e.id.toLowerCase() === id.toLowerCase());
      if (!found) {
        lookupError.textContent = `No employee found with ID "${id}".`;
        lookupError.hidden = false;
        return;
      }
      onViewEmployee(found.id);
    }

    tbody.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view-id]');
      if (viewBtn) onViewEmployee(viewBtn.getAttribute('data-view-id'));
    });
    searchInput.addEventListener('input', renderList);
    deptFilter.addEventListener('change', renderList);
    roleFilter.addEventListener('change', renderList);
    $('clear-filters-btn').addEventListener('click', clearFilters);
    $('lookup-id-btn').addEventListener('click', lookup);
    lookupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); lookup(); }
    });
    const roleSelect = $('role-select');
    if (roleSelect) roleSelect.addEventListener('change', load);

    return load();
  }

  function createDefaultApi(getRole = () => 'hr') {
    return {
      list: () => {
        const headers = { 'Content-Type': 'application/json' };
        if (getRole() !== 'signedout') headers['x-staff-role'] = getRole();
        return fetch('/employees', { method: 'GET', headers })
          .then((res) => res.json().catch(() => ({})).then((data) => (
            res.ok ? data : Promise.reject({ status: res.status, ...data })
          )));
      },
    };
  }

  if (typeof module !== 'undefined') module.exports = { initEmployeeDirectoryApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const roleSelect = document.getElementById('role-select');
      const getRole = () => roleSelect.value;
      initEmployeeDirectoryApp(
        document,
        createDefaultApi(getRole),
        getRole,
        (id) => { window.location.href = 'employee-record.html?id=' + encodeURIComponent(id); },
      );
    });
  }
}());
