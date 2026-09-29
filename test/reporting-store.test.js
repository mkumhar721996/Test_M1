function monthsAgoIso(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

describe('reporting store', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('AC1: a completed hire within the retention window remains in listHires()', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'ac1', worker: 'W', role: 'R', client: 'C', status: 'completed', eventDate: monthsAgoIso(3), metrics: {} });
    expect(store.listHires().some((h) => h.id === 'ac1')).toBe(true);
  });

  test('EDGE: an active hire is never hidden or deleted no matter how old its eventDate is', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'active-old', worker: 'W', role: 'R', client: 'C', status: 'active', eventDate: '2015-01-01', metrics: {} });
    expect(store.listHires().some((h) => h.id === 'active-old')).toBe(true);
    expect(store.getHireDetail('active-old').expired).toBe(false);
  });

  test('AC2: a hire past a customised (shorter) retention period is excluded from listHires()', () => {
    const store = require('../src/reporting/store');
    store.updateRetentionSettings(6, 'Jane Kim', 'tenant_admin');
    store.seedHire({ id: 'ac2', worker: 'W2', role: 'R2', client: 'C2', status: 'cancelled', eventDate: monthsAgoIso(7), metrics: {} });
    expect(store.listHires().some((h) => h.id === 'ac2')).toBe(false);
  });

  test('AC3: with the uncustomised default 12-month period, a hire completed 13 months ago is hidden', () => {
    const store = require('../src/reporting/store');
    expect(store.getRetentionSettings()).toMatchObject({ retentionMonths: 12, isCustomized: false });
    store.seedHire({ id: 'ac3', worker: 'W3', role: 'R3', client: 'C3', status: 'completed', eventDate: monthsAgoIso(13), metrics: {} });
    expect(store.listHires().some((h) => h.id === 'ac3')).toBe(false);
  });

  test('AC4: after an admin updates the retention period, later expiry checks use the new value', () => {
    const store = require('../src/reporting/store');
    store.updateRetentionSettings(3, 'Jane Kim', 'tenant_admin');
    expect(store.getRetentionSettings().retentionMonths).toBe(3);
    store.seedHire({ id: 'ac4', worker: 'W4', role: 'R4', client: 'C4', status: 'completed', eventDate: monthsAgoIso(4), metrics: {} });
    expect(store.listHires().some((h) => h.id === 'ac4')).toBe(false);
  });

  test('EDGE: increasing the retention period never triggers a deletion', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'ac4b', worker: 'W', role: 'R', client: 'C', status: 'completed', eventDate: monthsAgoIso(10), metrics: {} });
    const before = store.listAuditLog('deletion').length;
    store.updateRetentionSettings(24, 'Jane Kim', 'tenant_admin');
    expect(store.listAuditLog('deletion').length).toBe(before);
    expect(store.listHires().some((h) => h.id === 'ac4b')).toBe(true);
  });

  test('EDGE: retentionMonths outside 1-60, or non-numeric, is rejected and the config is unchanged', () => {
    const store = require('../src/reporting/store');
    const before = store.getRetentionSettings();
    [0, -1, 61, NaN].forEach((bad) => {
      expect(() => store.updateRetentionSettings(bad, 'Jane Kim', 'tenant_admin')).toThrow(store.ValidationError);
    });
    expect(store.getRetentionSettings()).toEqual(before);
  });

  test('EDGE: saving the same retentionMonths value again does not create a new config audit entry', () => {
    const store = require('../src/reporting/store');
    store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
    const before = store.listAuditLog('config').length;
    store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
    expect(store.listAuditLog('config').length).toBe(before);
  });

  test('AC7: a successful retention change is recorded with the admin identity and a timestamp', () => {
    const store = require('../src/reporting/store');
    store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
    const [latest] = store.listAuditLog('config');
    expect(latest).toMatchObject({ type: 'config', actor: 'Jane Kim', role: 'tenant_admin' });
    expect(typeof latest.timestamp).toBe('string');
  });

  test('EDGE: a denied retention-change attempt is itself recorded in the audit log', () => {
    const store = require('../src/reporting/store');
    const before = store.listAuditLog('denied').length;
    expect(() => store.updateRetentionSettings(1, 'Priya Sharma', 'recruiter')).toThrow(store.PermissionError);
    const denied = store.listAuditLog('denied');
    expect(denied.length).toBe(before + 1);
    expect(denied[0]).toMatchObject({ type: 'denied', actor: 'Priya Sharma', role: 'recruiter' });
  });

  test('EDGE: a denied retention-change attempt does not modify retentionConfig', () => {
    const store = require('../src/reporting/store');
    const before = store.getRetentionSettings();
    expect(() => store.updateRetentionSettings(1, 'Priya Sharma', 'recruiter')).toThrow(store.PermissionError);
    expect(store.getRetentionSettings()).toEqual(before);
  });

  test('AC8: a hire past retention is permanently deleted; only a minimal tombstone remains', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'ac8', worker: 'Carlos Mendez', role: 'Line Cook', client: 'Sunrise Catering Co.', status: 'cancelled', eventDate: monthsAgoIso(14), metrics: { timeToFill: '1 day' } });
    store.listHires();
    const detail = store.getHireDetail('ac8');
    expect(detail.expired).toBe(true);
    expect(detail.tombstone).toMatchObject({ worker: 'Carlos Mendez', status: 'cancelled' });
    expect(detail.tombstone.metrics).toBeUndefined();
    expect(store.listHires().some((h) => h.id === 'ac8')).toBe(false);
  });

  test("AC8: a tombstone's expiredOn is the computed retention-expiry date, not the raw eventDate", () => {
    const { computeExpiryDate } = require('../src/reporting/retention');
    const store = require('../src/reporting/store');
    const eventDate = monthsAgoIso(14);
    store.seedHire({ id: 'expiry-date-check', worker: 'W', role: 'R', client: 'C', status: 'completed', eventDate, metrics: {} });
    store.listHires();
    const detail = store.getHireDetail('expiry-date-check');
    expect(detail.tombstone.expiredOn).toBe(computeExpiryDate(eventDate, 12));
    expect(detail.tombstone.expiredOn).not.toBe(eventDate);
  });

  test('AC9: a hire past retention is deleted purely by calling updateRetentionSettings — no dashboard/detail read required', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'ac9', worker: 'W9', role: 'R9', client: 'C9', status: 'completed', eventDate: monthsAgoIso(20), metrics: {} });
    store.updateRetentionSettings(11, 'Jane Kim', 'tenant_admin');
    const [entry] = store.listAuditLog('deletion');
    expect(entry.description).toMatch(/permanently deleted 1 completed\/cancelled hire record\b/);
    expect(store.getHireDetail('ac9')).toMatchObject({ expired: true });
  });

  test('EDGE: N hires expiring together produce one deletion audit entry with count N, and re-sweeping is a no-op', () => {
    const store = require('../src/reporting/store');
    store.seedHire({ id: 'batch-1', worker: 'A', role: 'R', client: 'C', status: 'completed', eventDate: monthsAgoIso(20), metrics: {} });
    store.seedHire({ id: 'batch-2', worker: 'B', role: 'R', client: 'C', status: 'cancelled', eventDate: monthsAgoIso(20), metrics: {} });
    store.listHires();
    const [entry] = store.listAuditLog('deletion');
    expect(entry.description).toMatch(/permanently deleted 2 completed\/cancelled hire records/);
    const auditLenAfterFirstSweep = store.listAuditLog('deletion').length;
    store.listHires();
    expect(store.listAuditLog('deletion').length).toBe(auditLenAfterFirstSweep);
  });
});
