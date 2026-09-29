const { computeHireFlags, buildDashboard } = require('../src/dashboard/bottleneck');

test('AC1: exceeding the stage SLA flags the hire overdue', () => {
  const stage = { id: 'background_check', name: 'Background check', slaDays: 5 };
  const now = new Date('2026-09-29T00:00:00.000Z');
  const hire = { stageEnteredAt: '2026-09-21T00:00:00.000Z', lastActivityAt: '2026-09-28T00:00:00.000Z' };
  const flags = computeHireFlags(hire, stage, now);
  expect(flags.isOverdue).toBe(true);
  expect(flags.overdueBy).toBe(3);
});

test('AC2: 2+ flagged hires in a stage is a bottleneck, 1 is an individual outlier', () => {
  const now = new Date('2026-09-29T00:00:00.000Z');
  const back = (days) => new Date(now.getTime() - days * 86400000).toISOString();
  const hires = [
    { id: 'h1', hireStage: 'background_check', profileStatus: 'active', stageEnteredAt: back(8), lastActivityAt: back(1) },
    { id: 'h2', hireStage: 'background_check', profileStatus: 'active', stageEnteredAt: back(7), lastActivityAt: back(2) },
    { id: 'h3', hireStage: 'it_provisioning', profileStatus: 'active', stageEnteredAt: back(4), lastActivityAt: back(0) },
  ];
  const dashboard = buildDashboard(hires, now);
  const bgCheck = dashboard.stages.find((s) => s.stage.id === 'background_check');
  const itProv = dashboard.stages.find((s) => s.stage.id === 'it_provisioning');
  expect(bgCheck).toMatchObject({ isBottleneck: true, flaggedCount: 2 });
  expect(itProv).toMatchObject({ isBottleneck: false, flaggedCount: 1 });
});

test('AC4: within SLA with recent activity is not flagged', () => {
  const stage = { id: 'paperwork', name: 'Paperwork', slaDays: 3 };
  const now = new Date('2026-09-29T00:00:00.000Z');
  const hire = { stageEnteredAt: '2026-09-28T00:00:00.000Z', lastActivityAt: '2026-09-29T00:00:00.000Z' };
  const flags = computeHireFlags(hire, stage, now);
  expect(flags.isOverdue).toBe(false);
  expect(flags.isStalled).toBe(false);
});

test('AC5: within SLA but stale activity is flagged stalled', () => {
  const stage = { id: 'paperwork', name: 'Paperwork', slaDays: 3 };
  const now = new Date('2026-09-29T00:00:00.000Z');
  const hire = { stageEnteredAt: '2026-09-27T00:00:00.000Z', lastActivityAt: '2026-09-23T00:00:00.000Z' };
  const flags = computeHireFlags(hire, stage, now);
  expect(flags.isOverdue).toBe(false);
  expect(flags.isStalled).toBe(true);
  expect(flags.daysSinceActivity).toBe(6);
});
