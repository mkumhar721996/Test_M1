const { STAGES, STALL_THRESHOLD_DAYS } = require('./stages');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

function daysBetween(now, iso) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}

function computeHireFlags(hire, stage, now) {
  const daysInStage = daysBetween(now, hire.stageEnteredAt);
  const overdueBy = daysInStage - stage.slaDays;
  const isOverdue = overdueBy > 0;
  const activityUnknown = hire.lastActivityAt == null;
  const daysSinceActivity = activityUnknown ? null : daysBetween(now, hire.lastActivityAt);
  const isStalled = !isOverdue && !activityUnknown && daysSinceActivity >= STALL_THRESHOLD_DAYS;
  const isPartial = activityUnknown && !isOverdue;
  return {
    daysInStage,
    overdueBy: isOverdue ? overdueBy : 0,
    isOverdue,
    isStalled,
    isPartial,
    daysSinceActivity,
  };
}

function buildDashboard(hires, now = new Date()) {
  const eligible = hires.filter((h) => h.profileStatus === 'active' && STAGE_BY_ID[h.hireStage]);

  const stageGroups = STAGES.map((stage) => {
    const rows = eligible
      .filter((h) => h.hireStage === stage.id)
      .map((hire) => ({ hire, flags: computeHireFlags(hire, stage, now) }));
    const flaggedCount = rows.filter((r) => r.flags.isOverdue || r.flags.isStalled).length;
    return { stage, hires: rows, flaggedCount, isBottleneck: flaggedCount >= 2 };
  });

  const totalFlagged = stageGroups.reduce((sum, g) => sum + g.flaggedCount, 0);

  return {
    stages: stageGroups,
    totalHires: eligible.length,
    totalFlagged,
    generatedAt: now.toISOString(),
  };
}

module.exports = { computeHireFlags, buildDashboard };
