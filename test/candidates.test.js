/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'candidates.html');

function fixtureCandidate(overrides = {}) {
  return {
    id: 'hire_1001',
    name: 'Jordan Reyes',
    email: 'jordan.reyes@example.com',
    phone: '5551234567',
    department: 'Engineering',
    role: 'Software Engineer II',
    startDate: '2026-10-05',
    hireStage: 'draft',
    profileStatus: 'active',
    run: null,
    runHistory: [],
    auditLog: [{ ts: '2026-01-01T00:00:00.000Z', actor: 'Morgan Ellis', action: 'created candidate' }],
    ...overrides,
  };
}

describe('Candidates UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1: empty candidate list shows the guided empty-state prompt', () => {
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [], {});
    expect(document.getElementById('cand-empty-state').hidden).toBe(false);
    expect(document.getElementById('cand-empty-state').textContent).toContain('No candidates yet');
  });

  test('AC2: submitting a valid create form adds an active candidate to the directory', async () => {
    const created = fixtureCandidate({
      id: 'hire_9001', name: 'Sam Lee', email: 's@x.com', phone: '5551234567',
      department: 'Engineering', role: 'Engineer', startDate: '2026-11-01', hireStage: 'draft',
    });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [], api);

    document.getElementById('cand-add-btn').click();
    document.getElementById('cand-f-name').value = 'Sam Lee';
    document.getElementById('cand-f-email').value = 's@x.com';
    document.getElementById('cand-f-phone').value = '5551234567';
    document.getElementById('cand-f-department').value = 'Engineering';
    document.getElementById('cand-f-role').value = 'Engineer';
    document.getElementById('cand-f-startDate').value = '2026-11-01';
    document.getElementById('cand-create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam Lee', hireStage: 'draft' }));
    expect(document.getElementById('cand-tbody').textContent).toContain('Sam Lee');
    expect(document.getElementById('cand-empty-state').hidden).toBe(true);
  });

  test('AC3/AC4 UI: rejecting an active candidate with a running onboarding run calls deactivate and shows the deactivated banner', async () => {
    const candidate = fixtureCandidate({
      profileStatus: 'active',
      run: { id: 'run_1', status: 'active', startedAt: '2026-01-01T00:00:00.000Z', tasksDone: 1, totalTasks: 5, freshStart: false },
    });
    const deactivated = fixtureCandidate({
      profileStatus: 'deactivated',
      run: null,
      runHistory: [{ id: 'run_1', status: 'cancelled', reason: 'profile_deactivated' }],
      auditLog: [...candidate.auditLog, { ts: '2026-02-01T00:00:00.000Z', actor: 'Morgan Ellis', action: 'rejected candidate' }],
    });
    const api = { deactivate: jest.fn().mockResolvedValue(deactivated) };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], api);

    document.querySelector('.view-link-btn').click();
    document.getElementById('cand-deactivate-btn').click();
    document.getElementById('cand-deactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(api.deactivate).toHaveBeenCalledWith(candidate.id);
    expect(document.getElementById('cand-deactivated-banner').hidden).toBe(false);
    expect(document.getElementById('cand-deactivate-btn').hidden).toBe(true);
  });

  test('AC5 UI: reinstating a deactivated candidate calls reactivate and returns the profile to active', async () => {
    const candidate = fixtureCandidate({ profileStatus: 'deactivated', run: null });
    const reactivated = fixtureCandidate({
      profileStatus: 'active',
      run: { id: 'run_2', status: 'active', startedAt: '2026-03-01T00:00:00.000Z', tasksDone: 0, totalTasks: 5, freshStart: true },
      auditLog: [...candidate.auditLog, { ts: '2026-03-01T00:00:00.000Z', actor: 'Morgan Ellis', action: 'reinstated candidate' }],
    });
    const api = { reactivate: jest.fn().mockResolvedValue(reactivated) };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], api);

    document.querySelector('.view-link-btn').click();
    document.getElementById('cand-reactivate-btn').click();
    document.getElementById('cand-reactivate-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(api.reactivate).toHaveBeenCalledWith(candidate.id);
    expect(document.getElementById('cand-prof-status-chip').textContent).toContain('Active');
    expect(document.getElementById('cand-reactivate-btn').hidden).toBe(true);
  });

  test('AC6 UI: saving an edit sends only the changed fields and reflects last-write-wins', async () => {
    const candidate = fixtureCandidate();
    const updated = fixtureCandidate({ role: 'Senior Engineer' });
    const api = { update: jest.fn().mockResolvedValue(updated) };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], api);

    document.querySelector('.view-link-btn').click();
    document.getElementById('cand-edit-btn').click();
    document.getElementById('cand-ef-role').value = 'Senior Engineer';
    document.getElementById('cand-edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(api.update).toHaveBeenCalledWith(candidate.id, { role: 'Senior Engineer' });
    expect(document.getElementById('cand-kv-list').textContent).toContain('Senior Engineer');
  });

  test('AC7 UI: the audit trail renders actor and action for each entry, newest first', () => {
    const candidate = fixtureCandidate({
      auditLog: [
        { ts: '2026-01-01T00:00:00.000Z', actor: 'Morgan Ellis', action: 'created candidate' },
        { ts: '2026-01-02T00:00:00.000Z', actor: 'Morgan Ellis', action: 'updated role' },
      ],
    });
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], {});
    document.querySelector('.view-link-btn').click();
    const items = document.querySelectorAll('#cand-audit-list .audit-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('updated role');
    expect(items[1].textContent).toContain('created candidate');
  });

  test('AC8 UI: a deactivated candidate only shows Reinstate, never Reject', () => {
    const deactivated = {
      id: 'hire_1', name: 'A', email: 'a@x.com', phone: '5551234567',
      department: 'Engineering', role: 'Engineer', startDate: '2026-10-05', hireStage: 'draft',
      profileStatus: 'deactivated', run: null, runHistory: [], auditLog: [],
    };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [deactivated], { get: jest.fn().mockResolvedValue(deactivated) });
    document.querySelector('.view-link-btn').click();
    expect(document.getElementById('cand-reactivate-btn').hidden).toBe(false);
    expect(document.getElementById('cand-deactivate-btn').hidden).toBe(true);
  });

  test('AC9 UI: saving an edit with a missing name shows a field error and does not call the api', async () => {
    const candidate = {
      id: 'hire_1', name: 'A', email: 'a@x.com', phone: '5551234567',
      department: 'Engineering', role: 'Engineer', startDate: '2026-10-05', hireStage: 'draft',
      profileStatus: 'active', run: null, runHistory: [], auditLog: [],
    };
    const api = { get: jest.fn().mockResolvedValue(candidate), update: jest.fn() };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], api);
    document.querySelector('.view-link-btn').click();
    await Promise.resolve(); await Promise.resolve();
    document.getElementById('cand-edit-btn').click();
    document.getElementById('cand-ef-name').value = '';
    document.getElementById('cand-edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('cand-ee-name').hidden).toBe(false);
    expect(api.update).not.toHaveBeenCalled();
  });

  test('security UI: a candidate name containing markup is escaped, not rendered as HTML', () => {
    const candidate = {
      id: 'hire_1', name: '<img src=x onerror=alert(1)>', email: 'a@x.com',
      phone: '5551234567', department: 'Engineering', role: 'Engineer', startDate: '2026-10-05',
      hireStage: 'draft', profileStatus: 'active', run: null, runHistory: [], auditLog: [],
    };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], {});
    expect(document.getElementById('cand-tbody').querySelector('img')).toBeNull();
    expect(document.getElementById('cand-tbody').textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('edge case UI: double-submitting the create form only calls the api once', async () => {
    let resolveCreate;
    const api = { create: jest.fn(() => new Promise((resolve) => { resolveCreate = resolve; })) };
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [], api);
    document.getElementById('cand-add-btn').click();
    document.getElementById('cand-f-name').value = 'Sam Lee';
    document.getElementById('cand-f-email').value = 's@x.com';
    document.getElementById('cand-f-phone').value = '5551234567';
    document.getElementById('cand-f-department').value = 'Engineering';
    document.getElementById('cand-f-role').value = 'Engineer';
    document.getElementById('cand-f-startDate').value = '2026-11-01';
    const form = document.getElementById('cand-create-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(api.create).toHaveBeenCalledTimes(1);
    resolveCreate({ id: 'hire_x', name: 'Sam Lee', profileStatus: 'active', auditLog: [] });
    await Promise.resolve(); await Promise.resolve();
  });

  test('edge case UI: searching with regex-special characters does not throw', () => {
    const candidate = fixtureCandidate({ name: 'Jordan Reyes' });
    const { initCandidatesApp } = require('../public/js/candidates');
    initCandidatesApp(document, [candidate], {});
    const search = document.getElementById('cand-search-input');
    expect(() => {
      search.value = '.*(.+)+$';
      search.dispatchEvent(new Event('input'));
    }).not.toThrow();
    expect(document.getElementById('cand-no-results').hidden).toBe(false);
  });
});
