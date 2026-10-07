/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hire-profile.html');

function fixtureHire() {
  return {
    id: 'hire_2031',
    name: 'Jordan Reyes',
    email: 'jordan.reyes@example.com',
    phone: '(312) 555-0148',
    startDate: '2026-10-05',
    department: 'Engineering',
    role: 'Software Engineer II',
    hireStage: 'interview',
    profileStatus: 'active',
    run: null,
    runHistory: [],
  };
}
const flush = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };

describe('Hire Profile — Outcome card', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });
  const init = (hire, api = {}) => require('../public/js/hire-profile').initHireProfileApp(document, hire, api);

  test.each([
    ['active', 'Active'],
    ['deactivated', 'Deactivated'],
    ['rejected', 'Rejected'],
    ['withdrawn', 'Withdrawn'],
  ])('AC6: %s renders its own distinct status chip', (status, label) => {
    init({ ...fixtureHire(), profileStatus: status });
    const chip = document.getElementById('outcome-status-chip');
    expect(chip.innerHTML).toContain(`status-chip--${status}`);
    expect(chip.textContent).toContain(label);
  });

  test('AC1: confirming the reject dialog sends the reason and renders the Rejected chip', async () => {
    const api = { reject: jest.fn((reason) => Promise.resolve({ ...fixtureHire(), profileStatus: 'rejected', outcomeReason: reason })) };
    init(fixtureHire(), api);
    document.getElementById('reject-outcome-btn').click();
    expect(document.getElementById('outcome-modal').hidden).toBe(false);
    document.getElementById('outcome-reason').value = ' Not a fit ';
    document.getElementById('outcome-confirm-btn').click();
    await flush();
    expect(api.reject).toHaveBeenCalledWith('Not a fit');
    expect(document.getElementById('outcome-status-chip').innerHTML).toContain('status-chip--rejected');
    expect(document.getElementById('outcome-modal').hidden).toBe(true);
  });

  test('AC1: confirming the withdraw dialog calls api.withdraw', async () => {
    const api = { withdraw: jest.fn(() => Promise.resolve({ ...fixtureHire(), profileStatus: 'withdrawn' })) };
    init(fixtureHire(), api);
    document.getElementById('withdraw-outcome-btn').click();
    document.getElementById('outcome-confirm-btn').click();
    await flush();
    expect(api.withdraw).toHaveBeenCalledWith('');
    expect(document.getElementById('outcome-status-chip').innerHTML).toContain('status-chip--withdrawn');
  });

  test('AC4 (UI): a blocked mark attempt shows the server field error inline', async () => {
    const api = { reject: () => Promise.reject({ status: 400, fields: { profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is deactivated.' } }) };
    init({ ...fixtureHire(), profileStatus: 'deactivated' }, api);
    document.getElementById('reject-outcome-btn').click();
    document.getElementById('outcome-confirm-btn').click();
    await flush();
    const err = document.getElementById('outcome-error');
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('deactivated');
  });

  test('AC5 (UI): an access-denied response shows the denial toast and leaves status unchanged', async () => {
    const api = { reject: () => Promise.reject({ status: 403 }) };
    init(fixtureHire(), api);
    document.getElementById('reject-outcome-btn').click();
    document.getElementById('outcome-confirm-btn').click();
    await flush();
    expect(document.getElementById('toast-message').textContent).toContain('HR or Manager role required');
    expect(document.getElementById('outcome-status-chip').innerHTML).toContain('status-chip--active');
  });

  test.each(['rejected', 'withdrawn'])('AC2 (UI): Reactivate on a %s record shows a field-level error', async (status) => {
    const api = { reactivate: () => Promise.reject({ status: 400, error: 'validation_error', fields: { profileStatus: 'Cannot reactivate — status is final.' } }) };
    init({ ...fixtureHire(), profileStatus: status }, api);
    document.getElementById('reactivate-outcome-btn').click();
    await flush();
    const err = document.getElementById('outcome-error');
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('Cannot reactivate');
  });

  test('cancelling the dialog clears the reason without calling the API', () => {
    const api = { reject: jest.fn() };
    init(fixtureHire(), api);
    document.getElementById('reject-outcome-btn').click();
    document.getElementById('outcome-reason').value = 'draft';
    document.getElementById('outcome-cancel-btn').click();
    expect(document.getElementById('outcome-reason').value).toBe('');
    expect(api.reject).not.toHaveBeenCalled();
  });
});
