const { escapeHtml, formatDateDisplay } = require('./utils');

const REFRESH_INTERVAL_MS = 10000;
const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'People Ops', 'Finance'];
const HIRE_STAGES = ['draft', 'offer_accepted'];

function stageLabel(hireStage) {
  return hireStage === 'offer_accepted' ? 'Offer accepted' : 'Draft';
}

function filterHires(list, { stage = '', search = '', department = '', start = '', end = '' } = {}) {
  const q = search.trim().toLowerCase();
  return list.filter((h) => {
    if (stage && h.hireStage !== stage) return false;
    if (department && h.department !== department) return false;
    if (start && h.startDate < start) return false;
    if (end && h.startDate > end) return false;
    if (q && !(h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q))) return false;
    return true;
  });
}

function optionsMarkup(doc, values, current, allLabel, labelFor) {
  const opts = values.map((v) => `<option value="${escapeHtml(doc, v)}" ${v === current ? 'selected' : ''}>${escapeHtml(doc, labelFor ? labelFor(v) : v)}</option>`).join('');
  return `<option value="">${allLabel}</option>${opts}`;
}

function initHireDashboardApp(doc, initialHires, api) {
  let allHires = initialHires;

  const stageSelect = doc.getElementById('filter-stage');
  const searchInput = doc.getElementById('filter-search');
  const departmentSelect = doc.getElementById('filter-department');
  const startDateInput = doc.getElementById('filter-start-date');
  const endDateInput = doc.getElementById('filter-end-date');
  const clearFiltersBtn = doc.getElementById('clear-filters-btn');
  const tbody = doc.getElementById('hire-tbody');
  const resultCount = doc.getElementById('result-count');

  stageSelect.innerHTML = optionsMarkup(doc, HIRE_STAGES, stageSelect.value, 'All stages', stageLabel);
  departmentSelect.innerHTML = optionsMarkup(doc, DEPARTMENTS, departmentSelect.value, 'All departments');

  function readFilters() {
    return {
      stage: stageSelect.value,
      search: searchInput.value,
      department: departmentSelect.value,
      start: startDateInput.value,
      end: endDateInput.value,
    };
  }

  function render() {
    const activeHires = allHires.filter((h) => h.profileStatus === 'active');
    const filters = readFilters();
    const filtered = filterHires(activeHires, filters);

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      const tr = doc.createElement('tr');
      tr.className = 'no-match-row';
      tr.innerHTML = '<td colspan="5"><div class="no-match">' +
        '<p class="no-match-title">No matching hires</p>' +
        '<p class="no-match-body">No active hires match the current filters. Try widening the date range or clearing a filter.</p>' +
        '</div></td>';
      tbody.appendChild(tr);
    } else {
      filtered.forEach((h) => {
        const tr = doc.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(doc, h.name)}</td>
          <td>${escapeHtml(doc, h.id)}</td>
          <td>${escapeHtml(doc, h.department)}</td>
          <td>${escapeHtml(doc, stageLabel(h.hireStage))}</td>
          <td>${escapeHtml(doc, formatDateDisplay(h.startDate))}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    resultCount.textContent = `${filtered.length} of ${activeHires.length} hires match the current filters`;
  }

  stageSelect.addEventListener('change', render);
  departmentSelect.addEventListener('change', render);
  searchInput.addEventListener('input', render);
  startDateInput.addEventListener('input', render);
  endDateInput.addEventListener('input', render);
  clearFiltersBtn.addEventListener('click', () => {
    stageSelect.value = '';
    searchInput.value = '';
    departmentSelect.value = '';
    startDateInput.value = '';
    endDateInput.value = '';
    render();
  });

  setInterval(() => {
    api.list().then((hires) => {
      allHires = hires;
      render();
    }).catch((err) => {
      console.error('Hire dashboard auto-refresh failed — showing last-loaded data:', err);
    });
  }, REFRESH_INTERVAL_MS);

  render();
}

function createDefaultApi() {
  return { list: () => fetch('/hires').then((r) => r.json()) };
}

function showLoadError(doc, onRetry) {
  const content = doc.getElementById('dashboard-content');
  const errorPanel = doc.getElementById('load-error');
  if (content) content.hidden = true;
  if (errorPanel) errorPanel.hidden = false;
  const retryBtn = doc.getElementById('load-retry-btn');
  if (retryBtn) retryBtn.onclick = onRetry;
}

function hideLoadError(doc) {
  const content = doc.getElementById('dashboard-content');
  const errorPanel = doc.getElementById('load-error');
  if (content) content.hidden = false;
  if (errorPanel) errorPanel.hidden = true;
}

function loadAndInit(doc, api) {
  return api.list().then((hires) => {
    hideLoadError(doc);
    initHireDashboardApp(doc, hires, api);
  }).catch((err) => {
    console.error('Hire dashboard initial load failed:', err);
    showLoadError(doc, () => loadAndInit(doc, api));
  });
}

module.exports = { initHireDashboardApp, filterHires, loadAndInit, DEPARTMENTS, HIRE_STAGES, REFRESH_INTERVAL_MS };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loadAndInit(document, createDefaultApi());
  });
}
