function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateDisplay(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${m}/${d}/${y}`;
}

const STORAGE_KEY = 'expenses';

function loadExpenses(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function expensesForUser(user, expenses) {
  return expenses.filter((x) => x.loggedBy === user.name || x.approvedBy === user.name);
}

function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function statusChipHtml(status) {
  if (status === 'active') return '<span class="status-chip status-chip--active"><span aria-hidden="true">●</span> Active</span>';
  return '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">◌</span> Deactivated</span>';
}

function initUserHistory(doc, user, expenses) {
  const deactivated = user.status === 'deactivated';
  const rows = expensesForUser(user, expenses);

  doc.getElementById('history-name').textContent = user.name;
  doc.getElementById('history-meta').textContent = deactivated && user.deactivatedAt
    ? `${user.email} · Account deactivated ${new Date(user.deactivatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : user.email;
  doc.getElementById('history-status').innerHTML = statusChipHtml(user.status);
  doc.getElementById('history-title').textContent = `Expenses logged or approved by ${user.name}`;

  const banner = doc.getElementById('history-banner');
  banner.hidden = !deactivated;
  if (deactivated) {
    doc.getElementById('history-banner-text').textContent =
      `This account can no longer sign in. The expenses below are kept as read-only history tied to ${user.name}’s account — they’re still visible to the team, but nothing here can be edited.`;
  }

  const tbody = doc.getElementById('history-tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="readonly-tag">No expenses were logged or approved by ${escapeHtml(user.name)}.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((x) => (
    '<tr>' +
      `<td>${escapeHtml(formatDateDisplay(x.date))}</td>` +
      `<td>${escapeHtml(x.category)}</td>` +
      `<td>${escapeHtml(x.description)}</td>` +
      `<td>${formatUSD(x.amount)}</td>` +
      `<td>${escapeHtml(x.loggedBy)}</td>` +
      `<td>${escapeHtml(x.approvedBy || '—')}</td>` +
      '<td class="readonly-tag">Read-only</td>' +
    '</tr>'
  )).join('');
}

function showLoadError(doc) {
  doc.getElementById('history-card').hidden = true;
  doc.getElementById('history-error').hidden = false;
}

if (typeof module !== 'undefined') {
  module.exports = { initUserHistory, expensesForUser, loadExpenses, showLoadError };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const id = new URLSearchParams(window.location.search).get('id');
    let token = null;
    try { token = JSON.parse(window.sessionStorage.getItem('session')).token; } catch (e) { /* no session */ }
    if (!id || !token) {
      showLoadError(document);
      return;
    }
    fetch('/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((users) => {
        const user = users.find((u) => u.id === id);
        if (!user) {
          showLoadError(document);
          return;
        }
        initUserHistory(document, user, loadExpenses(window.localStorage));
      })
      .catch(() => showLoadError(document));
  });
}
