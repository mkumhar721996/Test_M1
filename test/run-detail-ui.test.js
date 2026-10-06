/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'run-detail.html');

function step(overrides) {
  return Object.assign({ description: '', owner: 'HR — Priya Shah' }, overrides);
}

function fixtureRun(overrides) {
  return Object.assign({
    id: 'run_7201',
    status: 'active',
    hire: { id: 'hire_2031', name: 'Jordan Reyes', role: 'Software Engineer II', department: 'Engineering', onboardingStatus: 'in_progress' },
    workflowName: 'Engineering Onboarding',
    startedAt: '2026-09-29T09:02:00.000Z',
    currentIndex: 1,
    steps: [
      step({ id: 's1', name: 'Collect signed offer letter', status: 'done' }),
      step({ id: 's2', name: 'Verify I-9 employment eligibility', status: 'current' }),
      step({ id: 's3', name: 'Provision IT accounts', status: 'upcoming' }),
    ],
    auditLog: [{ ts: '2026-09-29T09:02:00.000Z', actor: 'System', action: 'Run started. Step 1 of 3 is current.' }],
  }, overrides);
}

function blockedRun(requirementMet) {
  return fixtureRun({
    status: 'blocked',
    steps: [
      step({ id: 's1', name: 'Collect signed offer letter', status: 'done' }),
      step({
        id: 's2', name: 'Verify I-9 employment eligibility', status: 'blocked', requirementLabel: 'I-9 supporting document', requirementMet, blockReason: 'Required document missing',
      }),
      step({ id: 's3', name: 'Provision IT accounts', status: 'upcoming' }),
    ],
  });
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('Run Detail UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  const load = () => require('../public/js/run-detail').initRunDetailApp;

  test('AC2: shows each step with its status, the overall status and the run summary', () => {
    load()(document, fixtureRun(), {});

    expect(document.getElementById('run-status-chip').textContent).toContain('Active');
    expect(document.getElementById('progress-label').textContent).toBe('1 of 3 steps complete');
    expect(document.querySelectorAll('.step-item--done')).toHaveLength(1);
    expect(document.querySelector('.step-item--current .step-name').textContent).toBe('Verify I-9 employment eligibility');
    expect(document.getElementById('run-summary-body').textContent).toContain('Engineering Onboarding');
    expect(document.getElementById('run-summary-body').textContent).toContain('2026-09-29');
    expect(document.getElementById('field-error').hidden).toBe(true);
  });

  test('AC2: a blocked step is shown as blocked in the stepper', () => {
    load()(document, blockedRun(false), {});

    expect(document.getElementById('run-status-chip').textContent).toContain('Blocked');
    expect(document.querySelector('.step-item--blocked')).not.toBeNull();
    expect(document.querySelector('.step-item--upcoming')).not.toBeNull();
    expect(document.getElementById('field-error').hidden).toBe(false);
  });

  test('AC3: advancing a non-blocked step calls the API and renders the next step as current', async () => {
    const api = { advanceStep: jest.fn().mockResolvedValue(fixtureRun({
      currentIndex: 2,
      steps: [
        step({ id: 's1', name: 'Collect signed offer letter', status: 'done' }),
        step({ id: 's2', name: 'Verify I-9 employment eligibility', status: 'done' }),
        step({ id: 's3', name: 'Provision IT accounts', status: 'current' }),
      ],
    })) };
    load()(document, fixtureRun(), api);

    document.getElementById('advance-btn').click();
    await flush();

    expect(api.advanceStep).toHaveBeenCalledTimes(1);
    expect(document.getElementById('field-error').hidden).toBe(true);
    expect(document.querySelectorAll('.step-item--done')).toHaveLength(2);
    expect(document.querySelector('.step-item--current .step-name').textContent).toBe('Provision IT accounts');
  });

  test('AC4: a blocked advance response shows the inline field error with the requirement label', async () => {
    const api = { advanceStep: jest.fn().mockResolvedValue(blockedRun(false)) };
    load()(document, fixtureRun(), api);

    document.getElementById('advance-btn').click();
    await flush();

    const err = document.getElementById('field-error');
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('I-9 supporting document');
    expect(document.querySelector('.step-item--blocked')).not.toBeNull();
  });

  test('AC5: marking the requirement met flips it to Met and clears the field error', async () => {
    const api = { resolveRequirement: jest.fn().mockResolvedValue(blockedRun(true)) };
    load()(document, blockedRun(false), api);
    expect(document.getElementById('resolve-btn').textContent).toContain('Mark requirement met');

    document.getElementById('resolve-btn').click();
    await flush();

    expect(api.resolveRequirement).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.state--met').textContent).toContain('Met');
    expect(document.getElementById('resolve-btn')).toBeNull();
    expect(document.getElementById('field-error').hidden).toBe(true);
  });

  test('a completed run shows the success panel', () => {
    load()(document, fixtureRun({ status: 'completed' }), {});

    expect(document.querySelector('.success-panel').textContent).toContain('All 3 steps complete');
    expect(document.getElementById('run-status-chip').textContent).toContain('Completed');
  });

  test('the run activity list is always visible and lists entries', () => {
    load()(document, fixtureRun(), {});

    expect(document.getElementById('activity-list').hidden).toBe(false);
    expect(document.getElementById('activity-list').textContent).toContain('Run started. Step 1 of 3 is current.');
  });

  test('AC6: selecting a non-permitted role replaces the run with the access-denied panel', () => {
    load()(document, fixtureRun(), {});
    const select = document.getElementById('role-select');

    select.value = 'employee';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('run-denied-panel').hidden).toBe(false);
    expect(document.getElementById('run-fieldset').hidden).toBe(true);

    select.value = 'manager';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('run-denied-panel').hidden).toBe(true);
    expect(document.getElementById('run-fieldset').hidden).toBe(false);
  });

  test('submitting a step progression disables the fieldset and shows a loading label until it resolves', async () => {
    let resolveAdvance;
    const api = { advanceStep: () => new Promise((resolve) => { resolveAdvance = resolve; }), resolveRequirement: jest.fn() };
    load()(document, fixtureRun(), api);

    document.getElementById('advance-btn').click();

    expect(document.getElementById('run-fieldset').disabled).toBe(true);
    expect(document.getElementById('advance-btn').textContent).toContain('Advancing');
    expect(document.getElementById('pending-note')).not.toBeNull();

    resolveAdvance(fixtureRun({ currentIndex: 2 }));
    await flush();

    expect(document.getElementById('run-fieldset').disabled).toBe(false);
    expect(document.getElementById('pending-note')).toBeNull();
  });

  test('a second click while a request is pending does not send a second request', () => {
    const api = { advanceStep: jest.fn(() => new Promise(() => {})), resolveRequirement: jest.fn() };
    load()(document, fixtureRun(), api);

    document.getElementById('advance-btn').click();
    document.getElementById('advance-btn').click();

    expect(api.advanceStep).toHaveBeenCalledTimes(1);
  });

  test('a rejected request leaves the rendered run untouched and shows the error toast', async () => {
    let rejectAdvance;
    const api = { advanceStep: () => new Promise((_, reject) => { rejectAdvance = reject; }) };
    load()(document, fixtureRun(), api);
    const labelBefore = document.getElementById('progress-label').textContent;
    const stepperBefore = document.getElementById('stepper').innerHTML;

    document.getElementById('advance-btn').click();
    rejectAdvance(new Error('network error'));
    await flush();

    expect(document.getElementById('progress-label').textContent).toBe(labelBefore);
    expect(document.getElementById('stepper').innerHTML).toBe(stepperBefore);
    expect(document.getElementById('run-fieldset').disabled).toBe(false);
    expect(document.getElementById('error-toast').hidden).toBe(false);
    expect(document.getElementById('error-toast-message').textContent).toContain('Run state unchanged');
  });
});
