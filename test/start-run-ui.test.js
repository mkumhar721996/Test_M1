/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'start-run.html');

const hireFixture = { id: 'hire_1', name: 'Sam Lee', role: 'AE', department: 'Sales', profileStatus: 'active' };
const workflowFixture = {
  id: 'wf_1',
  name: 'Sales Onboarding',
  steps: [{ name: 'Offer letter', owner: 'HR' }, { name: 'Background check', owner: 'HR', requirementLabel: 'Check cleared' }],
};

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function choose(id, value) {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

describe('Start run UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  const load = () => require('../public/js/start-run');

  test('AC1: Start run is disabled until a hire and a workflow are both chosen', () => {
    load().initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, {});
    expect(document.getElementById('start-run-submit-btn').disabled).toBe(true);
    choose('hire-select', hireFixture.id);
    expect(document.getElementById('start-run-submit-btn').disabled).toBe(true);
    choose('workflow-select', workflowFixture.id);
    expect(document.getElementById('start-run-submit-btn').disabled).toBe(false);
  });

  test('AC1: choosing a workflow previews its steps and blocking requirements', () => {
    load().initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, {});
    choose('workflow-select', workflowFixture.id);
    const preview = document.getElementById('workflow-preview').textContent;
    expect(preview).toContain('Offer letter');
    expect(preview).toContain('Blocking requirement: Check cleared');
  });

  test('AC1: submitting calls the API with the chosen workflow and hire and navigates on success', async () => {
    const api = { startRun: jest.fn().mockResolvedValue({ id: 'run_9001' }) };
    const onStarted = jest.fn();
    load().initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, api, onStarted);
    choose('hire-select', hireFixture.id);
    choose('workflow-select', workflowFixture.id);

    document.getElementById('start-run-submit-btn').click();
    await flush();

    expect(api.startRun).toHaveBeenCalledWith(workflowFixture.id, hireFixture.id);
    expect(onStarted).toHaveBeenCalledWith('run_9001');
  });

  test('a failed start shows an inline error and re-enables the form', async () => {
    const api = { startRun: jest.fn().mockRejectedValue(new Error('nope')) };
    load().initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, api, jest.fn());
    choose('hire-select', hireFixture.id);
    choose('workflow-select', workflowFixture.id);

    document.getElementById('start-run-submit-btn').click();
    await flush();

    expect(document.getElementById('start-run-error').hidden).toBe(false);
    expect(document.getElementById('start-run-fieldset').disabled).toBe(false);
  });

  test('only active hires without an active or blocked run are offered', () => {
    const hires = [
      hireFixture,
      { ...hireFixture, id: 'hire_2', name: 'Busy' },
      { ...hireFixture, id: 'hire_3', name: 'Gone', profileStatus: 'deactivated' },
      { ...hireFixture, id: 'hire_4', name: 'Finished' },
    ];
    const runs = [{ hireId: 'hire_2', status: 'blocked' }, { hireId: 'hire_4', status: 'completed' }];
    expect(load().eligibleHires(hires, runs).map((h) => h.id)).toEqual(['hire_1', 'hire_4']);
  });

  test('no eligible hires renders the empty state', () => {
    load().initStartRunApp(document, { hires: [], workflows: [workflowFixture] }, {});
    expect(document.querySelector('.empty-state').textContent).toContain('Every current hire already has an onboarding run.');
  });

  test('AC6: the non-permitted role sees access denied instead of the form', () => {
    load().initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, {});
    const select = document.getElementById('role-select');
    select.value = 'employee';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector('.access-denied')).not.toBeNull();
    expect(document.getElementById('hire-select')).toBeNull();
  });
});
