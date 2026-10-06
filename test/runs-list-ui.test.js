/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'runs.html');

function summary(overrides) {
  return Object.assign({
    id: 'run_1',
    hireName: 'Jordan Reyes',
    role: 'SE II',
    department: 'Engineering',
    status: 'blocked',
    currentStepLabel: 'Step 2 of 5 — Verify I-9 employment eligibility',
    startedAt: '2026-09-29T09:02:00.000Z',
  }, overrides);
}

describe('Runs list UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC4 + AC8: each run shows its status chip and current-step label, and "View run" passes the run id', () => {
    const onViewRun = jest.fn();
    const { initRunsListApp } = require('../public/js/runs');
    initRunsListApp(document, [summary(), summary({ id: 'run_2', status: 'active', hireName: 'Sam' })], onViewRun);

    const tbody = document.getElementById('runs-tbody');
    expect(tbody.textContent).toContain('Verify I-9 employment eligibility');
    expect(tbody.querySelector('.status-chip--blocked').textContent).toContain('Blocked');
    expect(tbody.querySelector('.status-chip--active').textContent).toContain('Active');

    document.querySelector('[data-view-run]').click();
    expect(onViewRun).toHaveBeenCalledWith('run_1');
  });

  test('hire-supplied text is escaped rather than injected as markup', () => {
    const { initRunsListApp } = require('../public/js/runs');
    initRunsListApp(document, [summary({ hireName: '<img src=x onerror=alert(1)>' })], jest.fn());

    expect(document.querySelector('#runs-tbody img')).toBeNull();
  });

  test('an empty list renders an empty state', () => {
    const { initRunsListApp } = require('../public/js/runs');
    initRunsListApp(document, [], jest.fn());

    expect(document.querySelector('#runs-tbody .empty-state')).not.toBeNull();
  });

  test('the Runs nav link on the hire profile page points at the runs screen', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'hire-profile.html'), 'utf8');
    expect(html).toContain('<a href="runs.html">Runs</a>');
  });

  test('AC6: selecting the non-permitted role replaces the runs table with the access-denied panel', () => {
    const { initRunsListApp } = require('../public/js/runs');
    initRunsListApp(document, [summary()], jest.fn());
    const select = document.getElementById('role-select');

    select.value = 'employee';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector('.access-denied')).not.toBeNull();
    expect(document.getElementById('runs-tbody')).toBeNull();

    select.value = 'hr';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector('.access-denied')).toBeNull();
    expect(document.getElementById('runs-tbody')).not.toBeNull();
  });

  test('the header offers a Start onboarding run button', () => {
    expect(document.getElementById('start-run-btn').textContent).toBe('Start onboarding run');
  });
});
