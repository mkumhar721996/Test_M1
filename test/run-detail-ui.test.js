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

  test('AC8: shows the current step, completed steps and overall status', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), {});

    expect(document.getElementById('run-status-chip').textContent).toContain('Active');
    expect(document.getElementById('progress-label').textContent).toBe('1 of 3 steps complete');
    expect(document.querySelectorAll('.step-item--done')).toHaveLength(1);
    expect(document.querySelector('.step-item--current .step-name').textContent).toBe('Verify I-9 employment eligibility');
    expect(document.getElementById('complete-btn')).not.toBeNull();
  });

  test('AC4: a blocked run shows the blocked banner, block reason, and a disabled retry until the requirement is met', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, blockedRun(false), {});

    expect(document.getElementById('run-status-chip').textContent).toContain('Blocked');
    expect(document.querySelector('.blocked-banner').textContent).toContain('Required document missing');
    expect(document.querySelector('.step-item--blocked')).not.toBeNull();
    expect(document.querySelector('.step-item--upcoming')).not.toBeNull();
    expect(document.getElementById('retry-btn').disabled).toBe(true);
  });

  test('AC6 + AC7: marking the document received enables retry, and retry returns the run to active', async () => {
    const api = {
      resolveRequirement: jest.fn().mockResolvedValue(blockedRun(true)),
      advanceStep: jest.fn().mockResolvedValue(fixtureRun({ currentIndex: 2 })),
    };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, blockedRun(false), api);

    document.getElementById('resolve-btn').click();
    await flush();
    expect(api.resolveRequirement).toHaveBeenCalledTimes(1);
    expect(document.getElementById('retry-btn').disabled).toBe(false);

    document.getElementById('retry-btn').click();
    await flush();
    expect(api.advanceStep).toHaveBeenCalledTimes(1);
    expect(document.getElementById('run-status-chip').textContent).toContain('Active');
  });

  test('AC9 + AC10: a completed run shows the success panel and the completed hire record', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    const done = fixtureRun({
      status: 'completed',
      hire: { id: 'hire_2031', name: 'Jordan Reyes', role: 'SE', department: 'Eng', onboardingStatus: 'completed' },
    });
    initRunDetailApp(document, done, {});

    expect(document.querySelector('.success-panel').textContent).toContain('All 3 steps complete');
    expect(document.getElementById('hire-record-body').textContent).toContain('Completed');
    expect(document.getElementById('run-status-chip').textContent).toContain('Completed');
  });

  test('AC2: the audit log lists entries once expanded', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), {});

    expect(document.getElementById('audit-list').hidden).toBe(true);
    document.getElementById('audit-toggle-btn').click();

    expect(document.getElementById('audit-list').hidden).toBe(false);
    expect(document.getElementById('audit-list').textContent).toContain('Run started. Step 1 of 3 is current.');
  });

  test('AC11: submitting a step progression disables the fieldset and shows a loading label until it resolves', async () => {
    let resolveAdvance;
    const api = { advanceStep: () => new Promise((resolve) => { resolveAdvance = resolve; }), resolveRequirement: jest.fn() };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), api);

    document.getElementById('complete-btn').click();

    expect(document.getElementById('run-fieldset').disabled).toBe(true);
    expect(document.getElementById('complete-btn').textContent).toContain('Completing step');
    expect(document.getElementById('pending-note')).not.toBeNull();

    resolveAdvance(fixtureRun({ currentIndex: 2 }));
    await flush();

    expect(document.getElementById('run-fieldset').disabled).toBe(false);
    expect(document.getElementById('pending-note')).toBeNull();
  });

  test('a second click while a request is pending does not send a second request', () => {
    const api = { advanceStep: jest.fn(() => new Promise(() => {})), resolveRequirement: jest.fn() };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), api);

    document.getElementById('complete-btn').click();
    document.getElementById('complete-btn').click();

    expect(api.advanceStep).toHaveBeenCalledTimes(1);
  });

  test('AC12: a rejected request leaves the rendered run untouched and shows the error toast', async () => {
    let rejectAdvance;
    const api = { advanceStep: () => new Promise((_, reject) => { rejectAdvance = reject; }) };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), api);
    const labelBefore = document.getElementById('progress-label').textContent;
    const stepperBefore = document.getElementById('stepper').innerHTML;

    document.getElementById('complete-btn').click();
    rejectAdvance(new Error('network error'));
    await flush();

    expect(document.getElementById('progress-label').textContent).toBe(labelBefore);
    expect(document.getElementById('stepper').innerHTML).toBe(stepperBefore);
    expect(document.getElementById('run-fieldset').disabled).toBe(false);
    expect(document.getElementById('error-toast').hidden).toBe(false);
    expect(document.getElementById('error-toast-message').textContent).toContain('Run state unchanged');
  });

  test('AC1/AC2: a blocked run lists notified recipients per channel and the excluded owners', async () => {
    const run = blockedRun(false);
    run.steps[1].ownerName = 'Priya Shah';
    run.steps[2].ownerName = 'Devon Ruiz';
    const api = { getDeliveryLog: jest.fn().mockResolvedValue([
      { recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'In-app', status: 'delivered' },
      { recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'Email', status: 'delivered' },
      { recipientName: 'Morgan Ellis', recipientRole: 'Relevant manager', channel: 'In-app', status: 'delivered' },
      { recipientName: 'Morgan Ellis', recipientRole: 'Relevant manager', channel: 'Email', status: 'failed' },
    ]) };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, run, api);
    await flush();

    expect(api.getDeliveryLog).toHaveBeenCalledWith('run_7201');
    expect(document.querySelectorAll('#alert-panel-wrap .recipient-card')).toHaveLength(2);
    expect(document.querySelector('#alert-panel-wrap').textContent).toContain('Email not delivered');
    expect(document.querySelector('.excluded-box').textContent).toContain('Devon Ruiz');
    expect(document.querySelector('.excluded-box').textContent).not.toContain('Priya Shah');
  });

  test('a non-blocked run shows the no-alerts empty state', () => {
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), {});
    expect(document.querySelector('#alert-panel-wrap').textContent).toContain('Nothing has blocked on this run yet.');
  });
});
