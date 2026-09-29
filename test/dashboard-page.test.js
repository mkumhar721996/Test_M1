/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'dashboard.html');

function stage(id, name, slaDays) {
  return { id, name, slaDays };
}

function fixtureDashboard() {
  const backgroundCheck = stage('background_check', 'Background check', 5);
  const paperwork = stage('paperwork', 'Paperwork', 3);

  const overdueHire = {
    hire: { id: 'hire_2031', name: 'Jordan Reyes', role: 'Software Engineer II' },
    flags: { daysInStage: 8, overdueBy: 3, isOverdue: true, isStalled: false, isPartial: false, daysSinceActivity: 1 },
  };
  const stalledHire = {
    hire: { id: 'hire_2061', name: 'Casey Lin', role: 'Marketing Coordinator' },
    flags: { daysInStage: 2, overdueBy: 0, isOverdue: false, isStalled: true, isPartial: false, daysSinceActivity: 6 },
  };
  const onTrackHire = {
    hire: { id: 'hire_2094', name: 'Alicia Chen', role: 'QA Engineer' },
    flags: { daysInStage: 1, overdueBy: 0, isOverdue: false, isStalled: false, isPartial: false, daysSinceActivity: 0 },
  };

  const stages = [
    { stage: backgroundCheck, hires: [overdueHire], flaggedCount: 1, isBottleneck: false },
    { stage: paperwork, hires: [stalledHire, onTrackHire], flaggedCount: 1, isBottleneck: false },
  ];

  return {
    stages,
    totalHires: 3,
    totalFlagged: 2,
    generatedAt: new Date().toISOString(),
  };
}

describe('Onboarding Dashboard page', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC3: the overdue chip pairs an icon with a text label, not colour alone', () => {
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, fixtureDashboard());
    const chip = document.querySelector('.status-chip--overdue');
    expect(chip.querySelector('.status-chip-icon')).not.toBeNull();
    expect(chip.textContent).toMatch(/Overdue by \d+ day/);
  });

  test('AC3: the legend lists a non-colour cue for overdue, stalled, and bottleneck', () => {
    const items = Array.from(document.querySelectorAll('.legend-item')).map((el) => el.textContent);
    expect(items.some((t) => /Overdue/.test(t))).toBe(true);
    expect(items.some((t) => /Stalled/.test(t))).toBe(true);
    expect(items.some((t) => /Bottleneck/.test(t))).toBe(true);
  });

  test('AC4: an on-track hire row shows no status chip', () => {
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, fixtureDashboard());
    const row = Array.from(document.querySelectorAll('.hire-row')).find((r) => r.textContent.includes('Alicia Chen'));
    expect(row.querySelector('.status-chip')).toBeNull();
  });

  test('AC5: the stalled chip is visually and textually distinct from overdue', () => {
    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, fixtureDashboard());
    const chip = document.querySelector('.status-chip--stalled');
    expect(chip.querySelector('.status-chip-icon')).not.toBeNull();
    expect(chip.textContent).toMatch(/Stalled — no activity in \d+ days/);
  });

  test('AC2: a bottleneck stage shows a badge distinct from the per-hire chip, and drilling in lists the flagged hires', () => {
    const data = fixtureDashboard();
    data.stages[0].hires.push({
      hire: { id: 'hire_2018', name: 'Morgan Ito', role: 'Product Designer' },
      flags: { daysInStage: 7, overdueBy: 2, isOverdue: true, isStalled: false, isPartial: false, daysSinceActivity: 2 },
    });
    data.stages[0].flaggedCount = 2;
    data.stages[0].isBottleneck = true;

    const { initDashboardApp } = require('../public/js/dashboard');
    initDashboardApp(document, data);

    const badge = document.querySelector('.bottleneck-badge');
    expect(badge).not.toBeNull();
    document.querySelector('.bottleneck-badge-btn').click();
    expect(document.getElementById('drill-modal').hidden).toBe(false);
    expect(document.getElementById('drill-hire-list').textContent).toMatch(/Jordan Reyes/);
    expect(document.getElementById('drill-hire-list').textContent).toMatch(/Morgan Ito/);
  });
});
