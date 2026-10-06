function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateDisplay(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}

function initLeaveLookupApp(doc, api) {
  let employees = [];
  const select = doc.getElementById('lookup-employee-select');
  const region = doc.getElementById('lookup-region');

  function renderError(retry) {
    region.innerHTML = '<div class="error-state"><div class="icon" aria-hidden="true">⚠</div><h3>Couldn\'t load this employee\'s balance</h3><p>Something went wrong reaching the balances service — try again.</p><button type="button" class="btn btn-primary" id="retry-btn">Try again</button></div>';
    doc.getElementById('retry-btn').addEventListener('click', retry);
  }

  function showBalance() {
    const emp = employees.find((e) => e.id === select.value);
    if (!emp) {
      region.innerHTML = '';
      return Promise.resolve();
    }
    region.innerHTML = '<div class="muted-note" style="margin-bottom:var(--space-2);">Loading balance…</div><div class="skeleton skeleton-row"></div>';
    return Promise.all([api.listTypes(), Promise.resolve(api.getBalances(emp.id)).catch((err) => (
      err && err.status === 404 ? null : Promise.reject(err)
    ))]).then(([types, record]) => {
      if (!record) {
        region.innerHTML = `<div class="empty-state"><div class="icon" aria-hidden="true">🗒</div><h3>No starting balance yet</h3><p>${escapeHtml(emp.name)} has no starting balance recorded for any leave type.</p></div>`;
        return;
      }
      region.innerHTML = `<div class="card lookup-card">
        <h3 class="card-title">${escapeHtml(emp.name)}</h3>
        ${types.map((t) => `<div class="lookup-item"><span class="type-name">${escapeHtml(t.name)}</span><span class="type-amount">${escapeHtml(record.balances[t.id])} days</span></div>`).join('')}
        <div class="lookup-meta">Starting balance set ${formatDateDisplay(record.setAt)}. No accrual, carryover, or expiry is tracked in this story.</div>
      </div>`;
    }, () => renderError(showBalance));
  }

  select.addEventListener('change', showBalance);

  function load() {
    return Promise.resolve(api.listEmployees()).then((list) => {
      employees = list;
      if (list.length === 0) {
        select.innerHTML = '';
        region.innerHTML = '<div class="empty-state"><div class="icon" aria-hidden="true">🗂</div><h3>No employees yet</h3><p>Once an employee completes onboarding, they\'ll appear here.</p></div>';
        return;
      }
      select.innerHTML = list.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
      return showBalance();
    }, () => renderError(load));
  }

  return load();
}

function createLeaveLookupApi() {
  function get(url) {
    return fetch(url).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  return {
    listEmployees: () => get('/employees'),
    listTypes: () => get('/leave/types'),
    getBalances: (id) => get(`/leave/balances/${encodeURIComponent(id)}`),
  };
}

if (typeof module !== 'undefined') module.exports = { initLeaveLookupApp, createLeaveLookupApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initLeaveLookupApp(document, createLeaveLookupApi()));
}
