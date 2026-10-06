const LEAVE_TYPE_FIELDS = [
  { id: 'annual', label: 'Annual', defaultBalance: 15 },
  { id: 'sick', label: 'Sick', defaultBalance: 10 },
  { id: 'unpaid', label: 'Unpaid', defaultBalance: 5 },
];

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initLeaveBalancesApp(doc, api) {
  let employees = [];
  let balancesById = {};
  let editingId = null;
  let lastChangedId = null;
  let toastTimer = null;

  const $ = (id) => doc.getElementById(id);
  const region = $('balances-region');
  const overlay = $('modal-overlay');
  const modalWrap = $('modal-wrap');
  const form = $('balances-form');
  const saveBtn = $('save-balances-btn');
  const errorBanner = $('modal-error-banner');

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function renderRow(emp) {
    const record = balancesById[emp.id];
    const chips = record
      ? LEAVE_TYPE_FIELDS.map((t) => `<span class="bal-chip"><span class="bal-label">${t.label}</span> <span class="bal-amount">${escapeHtml(record.balances[t.id])}</span></span>`).join('')
      : '<span class="muted-note">No starting balance yet</span>';
    const label = record ? 'Adjust balances' : 'Set starting balances';
    const btnClass = record ? 'btn-secondary' : 'btn-primary';
    const attr = record ? 'data-adjust-balances-id' : 'data-set-balances-id';
    return `<div class="emp-row${emp.id === lastChangedId ? ' flash' : ''}">
      <div class="emp-id-col">
        <div class="emp-name">${escapeHtml(emp.name)}</div>
        <div class="emp-dept">${escapeHtml(emp.jobTitle)}</div>
      </div>
      <div class="balances-col">${chips}</div>
      <div class="action-col"><button type="button" class="btn ${btnClass}" ${attr}="${escapeHtml(emp.id)}">${label}</button></div>
    </div>`;
  }

  function renderList() {
    if (employees.length === 0) {
      region.innerHTML = '<div class="empty-state"><div class="icon" aria-hidden="true">🗂</div><h3>No employees yet</h3><p>Once an employee completes onboarding, they\'ll appear here for balance setup.</p></div>';
      return;
    }
    region.innerHTML = employees.map(renderRow).join('');
  }

  function renderLoading() {
    region.innerHTML = '<div class="muted-note" style="margin-bottom:var(--space-2);">Loading employees…</div>'
      + [1, 2, 3].map(() => '<div class="skeleton skeleton-row"></div>').join('');
  }

  function renderError() {
    region.innerHTML = '<div class="error-state"><div class="icon" aria-hidden="true">⚠</div><h3>Couldn\'t load employee balances</h3><p>Something went wrong reaching the balances service. Your data is safe — try again.</p><button type="button" class="btn btn-primary" id="retry-btn">Try again</button></div>';
    $('retry-btn').addEventListener('click', load);
  }

  function load() {
    renderLoading();
    return Promise.resolve(api.listEmployees()).then(async (list) => {
      employees = list;
      const records = await Promise.all(list.map((e) => Promise.resolve(api.getBalances(e.id)).catch(() => null)));
      balancesById = {};
      list.forEach((e, i) => { if (records[i]) balancesById[e.id] = records[i]; });
      renderList();
    }, renderError);
  }

  function setFieldError(id, invalid) {
    $(`error-${id}`).hidden = !invalid;
    $(`field-${id}`).setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  function openModal(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    editingId = employeeId;
    const record = balancesById[employeeId];
    $('modal-title').textContent = `${record ? 'Adjust' : 'Set'} starting balances — ${emp.name}`;
    LEAVE_TYPE_FIELDS.forEach((t) => {
      $(`field-${t.id}`).value = record ? record.balances[t.id] : t.defaultBalance;
      setFieldError(t.id, false);
    });
    errorBanner.innerHTML = '';
    overlay.hidden = false;
    modalWrap.hidden = false;
    doc.addEventListener('keydown', onModalKeydown);
    $('field-annual').focus();
  }

  function closeModal() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    saveBtn.disabled = false;
    editingId = null;
    doc.removeEventListener('keydown', onModalKeydown);
  }

  region.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-balances-id], [data-adjust-balances-id]');
    if (btn) openModal(btn.getAttribute('data-set-balances-id') || btn.getAttribute('data-adjust-balances-id'));
  });
  $('modal-close-btn').addEventListener('click', closeModal);
  $('modal-cancel-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    let invalid = false;
    LEAVE_TYPE_FIELDS.forEach((t) => {
      const raw = $(`field-${t.id}`).value.trim();
      const num = Number(raw);
      const bad = raw === '' || Number.isNaN(num) || num < 0;
      setFieldError(t.id, bad);
      invalid = invalid || bad;
      values[t.id] = num;
    });
    if (invalid) return;

    const emp = employees.find((x) => x.id === editingId);
    const wasSet = Boolean(balancesById[editingId]);
    saveBtn.disabled = true;
    errorBanner.innerHTML = '';
    return Promise.resolve(api.saveBalances(editingId, values)).then((record) => {
      balancesById[emp.id] = record;
      lastChangedId = emp.id;
      closeModal();
      renderList();
      lastChangedId = null;
      showToast(record.created === false || wasSet ? `Starting balances updated for ${emp.name}.` : `Starting balances set for ${emp.name}.`);
    }, () => {
      saveBtn.disabled = false;
      errorBanner.innerHTML = '<div class="banner-error">Couldn\'t save — check your connection and try again. Your entries haven\'t been lost.</div>';
    });
  });

  return load();
}

function createLeaveBalancesApi() {
  function request(url, method, body) {
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((res) => res.json().catch(() => ({})).then((data) => (
      res.ok ? data : Promise.reject({ status: res.status, ...data })
    )));
  }

  return {
    listEmployees: () => request('/employees', 'GET'),
    getBalances: (id) => request(`/leave/balances/${encodeURIComponent(id)}`, 'GET'),
    saveBalances: (id, values) => request(`/leave/balances/${encodeURIComponent(id)}`, 'POST', values),
  };
}

if (typeof module !== 'undefined') module.exports = { initLeaveBalancesApp, createLeaveBalancesApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initLeaveBalancesApp(document, createLeaveBalancesApi()));
}
