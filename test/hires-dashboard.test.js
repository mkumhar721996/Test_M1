/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hires-dashboard.html');

function fixtureData() {
  return {
    hires: [
      { id: 'hire-101', worker: 'Maria Gonzalez', role: 'Banquet Server', client: 'Grand Plaza Hotel', status: 'active', shiftDate: '2026-10-02' },
      { id: 'hire-102', worker: 'David Chen', role: 'Warehouse Associate', client: 'Riverside Distribution Center', status: 'completed', eventDate: '2026-08-15', metrics: { timeToFill: '2.4 days', clientRating: '4.9 / 5' } },
      { id: 'hire-103', worker: 'Aisha Bello', role: 'Event Staff', client: 'Lakeside Convention Center', status: 'cancelled', eventDate: '2026-06-02', metrics: {} },
      { id: 'hire-104', worker: 'Tom Walker', role: 'Banquet Server', client: 'Grand Plaza Hotel', status: 'completed', eventDate: '2025-11-20', metrics: {} },
    ],
    retentionSettings: { retentionMonths: 12, isCustomized: false, hiddenCount: 3 },
    auditLog: [
      { type: 'config', actor: 'Jane Kim', role: 'tenant_admin', timestamp: 'Sep 28, 2026 · 09:41', description: 'changed the retention period from 12 months to 6 months' },
      { type: 'deletion', actor: 'System', role: 'Automated retention sweep', timestamp: 'Sep 27, 2026 · 02:00', description: 'permanently deleted 3 completed/cancelled hire records that exceeded the 12-month retention period' },
      { type: 'denied', actor: 'Priya Sharma', role: 'recruiter', timestamp: 'Nov 2, 2025 · 16:05', description: 'attempted to change the retention period — request denied (tenant administrator role required)' },
    ],
  };
}

describe('Hires Dashboard UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1: a within-retention completed hire renders with its "Expires" chip', () => {
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
    expect(document.querySelector('[data-hire="hire-102"] .retention-chip').textContent).toMatch(/Expires/);
  });

  test('AC2/AC3: the info banner names the current retention period and hidden-record count', () => {
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
    expect(document.querySelector('.info-banner').textContent).toMatch(/3 completed\/cancelled hires/);
    expect(document.querySelector('.info-banner').textContent).toMatch(/12/);
  });

  test('EDGE: an active hire card renders with no retention chip', () => {
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
    const activeCard = document.querySelector('[data-hire="hire-101"]');
    expect(activeCard.querySelector('.retention-chip')).toBeNull();
  });

  test('AC1: opening a within-retention hire renders its SLA metrics', async () => {
    const api = { getHireDetail: () => Promise.resolve({ expired: false, hire: { worker: 'David Chen', role: 'Warehouse Associate', client: 'Riverside Distribution Center', status: 'completed', eventDate: '2026-08-15', metrics: { timeToFill: '2.4 days' } } }) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-hire="hire-102"] .view-link').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.sla-grid').textContent).toContain('2.4 days');
  });

  test('AC5/AC6: a non-admin save is rejected and the input reverts to the previous value', async () => {
    const api = { updateRetention: () => Promise.reject({ status: 403, retentionSettings: { retentionMonths: 12, isCustomized: false, hiddenCount: 3 } }) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Priya Sharma', role: 'recruiter' });
    document.querySelector('[data-nav="settings"]').click();
    document.getElementById('retention-input').value = '3';
    document.getElementById('save-btn').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('retention-input').value).toBe('12');
    expect(document.getElementById('error-callout').hidden).toBe(false);
  });

  test('AC4/AC7: an admin save succeeds, updates the input, and prepends a "Just now" audit entry', async () => {
    const api = { updateRetention: (months) => Promise.resolve({ retentionMonths: months, isCustomized: true, hiddenCount: 3 }) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-nav="settings"]').click();
    document.getElementById('retention-input').value = '20';
    document.getElementById('save-btn').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('retention-input').value).toBe('20');
    expect(document.getElementById('recent-audit').textContent).toContain('Just now');
  });

  test('EDGE: opening an expired hire renders the retention-expired empty-state, not SLA metrics', async () => {
    const api = { getHireDetail: () => Promise.resolve({ expired: true, tombstone: { worker: 'Carlos Mendez', role: 'Line Cook', client: 'Sunrise Catering Co.', status: 'cancelled', eventDate: '2025-06-10', expiredOn: '2026-06-10', deletedOn: '2026-06-11' } }) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-hire="hire-102"] .view-link').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.empty-state h2').textContent).toMatch(/no longer available/);
    expect(document.querySelector('.sla-grid')).toBeNull();
  });

  test('server-shaped audit entries (raw role codes) render with display labels, not raw codes', () => {
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-nav="audit"]').click();
    const text = document.getElementById('full-audit-list').textContent;
    expect(text).toContain('Tenant Administrator');
    expect(text).toContain('Recruiter');
    expect(text).not.toContain('tenant_admin');
    expect(text).not.toContain('recruiter');
  });

  test('EDGE: a client-side "Just now" audit entry (from a successful save) also renders with a display label', async () => {
    const api = { updateRetention: (months) => Promise.resolve({ retentionMonths: months, isCustomized: true, hiddenCount: 3 }) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-nav="settings"]').click();
    document.getElementById('retention-input').value = '20';
    document.getElementById('save-btn').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('recent-audit').textContent).toContain('Tenant Administrator');
    expect(document.getElementById('recent-audit').textContent).not.toContain('tenant_admin');
  });

  test('CRITICAL: a failed hire-detail fetch shows an error message and stays on the dashboard', async () => {
    const api = { getHireDetail: () => Promise.reject(new Error('network error')) };
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-hire="hire-102"] .view-link').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('dashboard-screen').hidden).toBe(false);
    expect(document.getElementById('dashboard-toast').hidden).toBe(false);
    expect(document.getElementById('dashboard-toast').textContent.length).toBeGreaterThan(0);
  });

  test('EDGE: the audit-log screen filters entries by type', () => {
    const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
    initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
    document.querySelector('[data-nav="audit"]').click();
    document.querySelector('[data-filter="denied"]').click();
    const visible = Array.from(document.querySelectorAll('#full-audit-list .audit-item')).filter((li) => li.style.display !== 'none');
    expect(visible.length).toBe(1);
    expect(visible[0].getAttribute('data-type')).toBe('denied');
  });
});
