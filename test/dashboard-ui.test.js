/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'dashboard.html');

describe('Dashboard UI — stale-data banner', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC2: stale data shows a visible banner with the last-fetch timestamp', () => {
    const payload = { data: [], stale: true, lastFetchedAt: '2026-09-27T10:00:00.000Z', significantlyStale: false };
    const api = { fetchDashboard: jest.fn() };
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, payload, api);

    expect(document.getElementById('stale-banner').hidden).toBe(false);
    expect(document.getElementById('stale-banner-text').textContent).toContain('2026-09-27');
  });

  test('AC1: fresh data renders no banner and shows the pipeline rows', () => {
    const payload = {
      data: [{ hireId: 'hire_1', name: 'Jordan Reyes', stage: 'offer', updatedAt: '2026-09-28T09:00:00.000Z' }],
      stale: false,
      lastFetchedAt: '2026-09-28T09:00:00.000Z',
      significantlyStale: false,
    };
    const api = { fetchDashboard: jest.fn() };
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, payload, api);

    expect(document.getElementById('stale-banner').hidden).toBe(true);
    expect(document.getElementById('pipeline-tbody').textContent).toContain('Jordan Reyes');
  });

  test('AC3: a successful manual refresh clears the banner and swaps in fresh data', async () => {
    const stalePayload = {
      data: [{ hireId: 'hire_1', name: 'Jordan Reyes', stage: 'offer', updatedAt: '2026-09-27T10:00:00.000Z' }],
      stale: true,
      lastFetchedAt: '2026-09-27T10:00:00.000Z',
      significantlyStale: false,
    };
    const freshPayload = {
      data: [{ hireId: 'hire_1', name: 'Jordan Reyes', stage: 'background_check', updatedAt: '2026-09-28T09:00:00.000Z' }],
      stale: false,
      lastFetchedAt: '2026-09-28T09:00:00.000Z',
      significantlyStale: false,
    };
    const api = { fetchDashboard: jest.fn().mockResolvedValue(freshPayload) };
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, stalePayload, api);

    document.getElementById('refresh-btn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('stale-banner').hidden).toBe(true);
    expect(document.getElementById('pipeline-tbody').textContent).toContain('background_check');
  });

  test('AC4: significantly stale data renders the stronger warning copy and modifier class', () => {
    const payload = {
      data: [],
      stale: true,
      significantlyStale: true,
      lastFetchedAt: '2026-09-01T00:00:00.000Z',
    };
    const api = { fetchDashboard: jest.fn() };
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, payload, api);

    expect(document.getElementById('stale-banner').classList.contains('stale-banner--significant')).toBe(true);
    expect(document.getElementById('stale-banner-text').textContent).toMatch(/significantly out of date/i);
  });
});
