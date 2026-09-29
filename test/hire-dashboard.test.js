/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-dashboard.html');

function fixtureHires() {
  return [
    { id: 'hire_1001', name: 'Jordan Reyes', department: 'Engineering', hireStage: 'offer_accepted', startDate: '2026-10-05', profileStatus: 'active' },
    { id: 'hire_1002', name: 'Casey Kim', department: 'Sales', hireStage: 'draft', startDate: '2026-09-20', profileStatus: 'active' },
    { id: 'hire_1003', name: 'Alex Chen', department: 'Engineering', hireStage: 'draft', startDate: '2026-08-01', profileStatus: 'active' },
    { id: 'hire_1004', name: 'Deactivated Dana', department: 'Product', hireStage: 'draft', startDate: '2026-07-01', profileStatus: 'deactivated' },
  ];
}

describe('Dashboard Filtering', () => {
  let api;
  let REFRESH_INTERVAL_MS;

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    api = { list: jest.fn(() => Promise.resolve(fixtureHires())) };
    const mod = require('../public/js/hire-dashboard');
    REFRESH_INTERVAL_MS = mod.REFRESH_INTERVAL_MS;
    mod.initHireDashboardApp(document, fixtureHires(), api);
  });

  test('loads showing every active hire and excludes deactivated ones', () => {
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(3);
    expect(document.getElementById('result-count').textContent).toMatch(/3 of 3/);
    expect(Array.from(rows).some((r) => r.textContent.includes('Deactivated Dana'))).toBe(false);
  });

  test('AC1: selecting a stage immediately narrows the table to hires in that stage', () => {
    document.getElementById('filter-stage').value = 'draft';
    document.getElementById('filter-stage').dispatchEvent(new Event('change'));
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(2);
    expect(document.getElementById('result-count').textContent).toMatch(/2 of 3/);
  });

  test('AC2: typing a hire name narrows the table to matching hires', () => {
    document.getElementById('filter-search').value = 'Jordan';
    document.getElementById('filter-search').dispatchEvent(new Event('input'));
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Jordan Reyes');
  });

  test('AC2: typing a hire ID narrows the table to the matching hire', () => {
    document.getElementById('filter-search').value = 'hire_1002';
    document.getElementById('filter-search').dispatchEvent(new Event('input'));
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Casey Kim');
  });

  test('AC3: selecting a department immediately narrows the table to that department', () => {
    document.getElementById('filter-department').value = 'Engineering';
    document.getElementById('filter-department').dispatchEvent(new Event('change'));
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(2);
  });

  test('AC4: setting a start-date range narrows the table to hires starting within it', () => {
    document.getElementById('filter-start-date').value = '2026-09-01';
    document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
    document.getElementById('filter-end-date').value = '2026-10-31';
    document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(2);
    expect(Array.from(rows).some((r) => r.textContent.includes('Alex Chen'))).toBe(false);
  });

  test('AC5: clearing all filter controls restores the full active-hire list', () => {
    document.getElementById('filter-department').value = 'Engineering';
    document.getElementById('filter-department').dispatchEvent(new Event('change'));
    document.getElementById('clear-filters-btn').click();
    expect(document.getElementById('filter-stage').value).toBe('');
    expect(document.getElementById('filter-search').value).toBe('');
    expect(document.getElementById('filter-department').value).toBe('');
    expect(document.getElementById('filter-start-date').value).toBe('');
    expect(document.getElementById('filter-end-date').value).toBe('');
    expect(document.querySelectorAll('#hire-tbody tr').length).toBe(3);
  });

  test('AC6: an auto-refresh preserves active filters and re-applies them to the refreshed data', async () => {
    jest.useFakeTimers();
    document.getElementById('filter-department').value = 'Engineering';
    document.getElementById('filter-department').dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#hire-tbody tr').length).toBe(2); // Jordan + Alex

    const refreshed = [
      { id: 'hire_1001', name: 'Jordan Reyes', startDate: '2026-10-05', department: 'Engineering', hireStage: 'offer_accepted', profileStatus: 'active' },
      { id: 'hire_1005', name: 'Sam Park', startDate: '2026-10-10', department: 'Engineering', hireStage: 'draft', profileStatus: 'active' },
      { id: 'hire_1002', name: 'Casey Kim', startDate: '2026-09-20', department: 'Sales', hireStage: 'draft', profileStatus: 'active' },
    ];
    api.list.mockResolvedValueOnce(refreshed);

    jest.advanceTimersByTime(REFRESH_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('filter-department').value).toBe('Engineering');
    const rows = document.querySelectorAll('#hire-tbody tr');
    expect(rows.length).toBe(2);
    expect(Array.from(rows).some((r) => r.textContent.includes('Casey Kim'))).toBe(false);
    expect(Array.from(rows).some((r) => r.textContent.includes('Sam Park'))).toBe(true);
    jest.useRealTimers();
  });

  test('filterHires is a pure function that AND-combines every filter condition', () => {
    const { filterHires } = require('../public/js/hire-dashboard');
    const list = [
      { id: 'hire_a', name: 'A', department: 'Engineering', hireStage: 'draft', startDate: '2026-09-01' },
      { id: 'hire_b', name: 'B', department: 'Sales', hireStage: 'offer_accepted', startDate: '2026-09-05' },
    ];
    expect(filterHires(list, { department: 'Engineering' })).toEqual([list[0]]);
    expect(filterHires(list, { stage: 'offer_accepted', search: 'b' })).toEqual([list[1]]);
    expect(filterHires(list, {})).toEqual(list);
  });

  test('an auto-refresh failure is swallowed so the interval keeps refreshing on the next tick', async () => {
    jest.useFakeTimers();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    api.list.mockRejectedValueOnce(new Error('refresh failed'));

    jest.advanceTimersByTime(REFRESH_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();

    // Failed refresh leaves the last-loaded data on screen, no crash.
    expect(document.querySelectorAll('#hire-tbody tr').length).toBe(3);
    expect(consoleErrorSpy).toHaveBeenCalled();

    const nextRefresh = fixtureHires().filter((h) => h.id !== 'hire_1003');
    api.list.mockResolvedValueOnce(nextRefresh);

    jest.advanceTimersByTime(REFRESH_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();

    // The interval kept firing: the following successful refresh still applies.
    expect(document.querySelectorAll('#hire-tbody tr').length).toBe(2);

    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });
});

describe('Dashboard Filtering — initial load resilience', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('a failed initial load shows a retry-able error state instead of a blank dashboard', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failingApi = { list: jest.fn(() => Promise.reject(new Error('network error'))) };
    const { loadAndInit } = require('../public/js/hire-dashboard');

    await loadAndInit(document, failingApi);

    expect(document.getElementById('load-error').hidden).toBe(false);
    expect(document.getElementById('dashboard-content').hidden).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('clicking Retry after a failed initial load re-fetches and shows the dashboard on success', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const flakyApi = { list: jest.fn() };
    flakyApi.list
      .mockImplementationOnce(() => Promise.reject(new Error('network error')))
      .mockImplementationOnce(() => Promise.resolve(fixtureHires()));
    const { loadAndInit } = require('../public/js/hire-dashboard');

    await loadAndInit(document, flakyApi);
    expect(document.getElementById('load-error').hidden).toBe(false);

    document.getElementById('load-retry-btn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('load-error').hidden).toBe(true);
    expect(document.getElementById('dashboard-content').hidden).toBe(false);
    expect(document.querySelectorAll('#hire-tbody tr').length).toBe(3);
    expect(flakyApi.list).toHaveBeenCalledTimes(2);

    console.error.mockRestore();
  });
});
