const crypto = require('crypto');
const { getLatestVersion, createWorkflow } = require('../workflows/store');
const { createEmployee } = require('../employees/store');
const { appendOnboardingAuditEntry } = require('../hires/store');

const runs = new Map();

const REQUIRED_STAFF_FIELDS = ['name', 'email', 'department', 'role', 'startDate'];

function buildSteps(taskGraph, startedAt) {
  const tasks = (taskGraph && taskGraph.tasks) || [];
  if (tasks.length === 0) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const referenced = new Set(tasks.flatMap((t) => t.next || []));
  const root = tasks.find((t) => !referenced.has(t.id)) || tasks[0];

  const ordered = [];
  const seen = new Set();
  let task = root;
  while (task && !seen.has(task.id)) {
    seen.add(task.id);
    ordered.push(task);
    task = byId.get((task.next || [])[0]);
  }

  return ordered.map((t, i) => {
    const hasDeadline = t.deadlineOffsetHours != null;
    return {
    id: t.id,
    name: t.name || t.id,
    description: t.description || '',
    owner: t.owner || '',
    status: i === 0 ? 'current' : 'upcoming',
    requirementLabel: t.requirement ? t.requirement.label : undefined,
    requirementMet: t.requirement ? Boolean(t.requirement.metByDefault) : undefined,
    blockReason: t.requirement ? t.requirement.blockReason : undefined,
    dueAt: hasDeadline ? new Date(new Date(startedAt).getTime() + t.deadlineOffsetHours * 3600000).toISOString() : null,
    ...(hasDeadline && {
      reminderWindowHours: t.reminderWindowHours || 48,
      reminderCadenceHours: 12,
      maxReminders: 5,
      remindersSent: 0,
      lastReminderAt: null,
      hrContact: t.hrContact || 'HR',
      managerContact: t.managerContact || 'Manager',
    }),
    };
  });
}

function startRun(workflowId, hireId = null) {
  const definition = getLatestVersion(workflowId);
  if (!definition) return undefined;
  const startedAt = new Date().toISOString();
  const steps = buildSteps(definition.taskGraph, startedAt);
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    definitionVersion: definition.version,
    taskGraph: definition.taskGraph,
    status: 'active',
    employeeId: null,
    hireId,
    currentIndex: 0,
    steps,
    auditLog: [{ ts: startedAt, actor: 'System', action: `Run started. Step 1 of ${steps.length} is current.` }],
    startedAt,
  };
  runs.set(run.id, run);
  if (hireId) appendOnboardingAuditEntry(hireId, 'System', run.auditLog[0].action);
  return run;
}

function listRuns() {
  return Array.from(runs.values()).map((run) => JSON.parse(JSON.stringify(run)));
}

function advanceStep(runId, actor = 'Manager') {
  const run = runs.get(runId);
  if (!run) return undefined;
  if (run.status === 'completed') return run;

  const idx = run.currentIndex;
  const step = run.steps[idx];
  if (!step) return run;
  const wasBlocked = step.status === 'blocked';

  if (step.requirementLabel && !step.requirementMet) {
    step.status = 'blocked';
    run.status = 'blocked';
    run.auditLog.push({
      ts: new Date().toISOString(),
      actor: 'System',
      action: `Attempted step ${idx + 1} of ${run.steps.length} (${step.name}) — blocked: ${step.blockReason}`,
    });
    return run;
  }

  step.status = 'done';
  if (idx === run.steps.length - 1) {
    run.status = 'completed';
    const action = `Stage transition: step ${idx + 1} of ${run.steps.length} (${step.name}) completed — all steps finished. Run marked completed.`;
    run.auditLog.push({ ts: new Date().toISOString(), actor, action });
    if (run.hireId) appendOnboardingAuditEntry(run.hireId, actor, action, { completed: true });
  } else {
    run.currentIndex = idx + 1;
    const nextStep = run.steps[run.currentIndex];
    nextStep.status = 'current';
    run.status = 'active';
    const action = `Stage transition: step ${idx + 1} of ${run.steps.length} (${step.name}) completed${wasBlocked ? ' after blocking condition resolved' : ''} — advanced to step ${idx + 2} of ${run.steps.length} (${nextStep.name}).`;
    run.auditLog.push({ ts: new Date().toISOString(), actor, action });
    if (run.hireId) appendOnboardingAuditEntry(run.hireId, actor, action);
  }
  return run;
}

function resolveStepRequirement(runId, actor = 'HR') {
  const run = runs.get(runId);
  if (!run) return undefined;
  const step = run.steps[run.currentIndex];
  if (!step || !step.requirementLabel || run.status === 'completed') return run;
  step.requirementMet = true;
  run.auditLog.push({
    ts: new Date().toISOString(),
    actor,
    action: `${step.requirementLabel} marked received ahead of retry.`,
  });
  return run;
}

function getRun(runId) {
  return runs.get(runId);
}

function getActiveRuns() {
  return Array.from(runs.values()).filter((run) => run.status !== 'completed');
}

function completeRun(runId, payload = {}) {
  const run = runs.get(runId);
  if (!run) return undefined;
  if (run.employeeId) return run;

  const missingFields = REQUIRED_STAFF_FIELDS.filter((field) => !payload[field]);
  if (missingFields.length > 0) {
    console.error(`[runs] run ${runId} completion missing required staff fields: ${missingFields.join(', ')}`);
    run.status = 'completed';
    return run;
  }

  const employee = createEmployee({ ...payload, employmentStatus: 'active' });
  run.status = 'completed';
  run.employeeId = employee.id;
  return run;
}

function seedExampleRun() {
  const workflow = createWorkflow({
    tasks: [
      { id: 'step_offer_letter', name: 'Collect signed offer letter', description: 'Confirm Jordan has returned a signed copy of the offer letter.', owner: 'HR — Priya Shah', next: ['step_i9'] },
      {
        id: 'step_i9',
        name: 'Verify I-9 employment eligibility',
        description: 'Confirm the required I-9 supporting document has been uploaded and reviewed.',
        owner: 'HR — Priya Shah',
        requirement: { label: 'I-9 supporting document', blockReason: 'Required document missing — Jordan has not yet uploaded I-9 supporting documentation.' },
        next: ['step_it'],
      },
      { id: 'step_it', name: 'Provision IT accounts & equipment', description: 'Assign a laptop and create system accounts.', owner: 'IT — Devon Ruiz', deadlineOffsetHours: 72, reminderWindowHours: 48, hrContact: 'HR — Priya Shah', managerContact: 'Manager — Morgan Ellis', next: ['step_orientation'] },
      { id: 'step_orientation', name: 'Assign onboarding buddy & complete orientation', description: 'Pair Jordan with a buddy and confirm orientation attendance.', owner: 'Manager — Morgan Ellis', next: ['step_checkin'] },
      { id: 'step_checkin', name: 'Manager check-in & 30-day goals sign-off', description: 'Document 30-day goals and confirm manager sign-off.', owner: 'Manager — Morgan Ellis', next: [] },
    ],
  });
  const run = startRun(workflow.workflowId, 'hire_2031');
  advanceStep(run.id);
}

seedExampleRun();

module.exports = { startRun, getActiveRuns, getRun, listRuns, completeRun, advanceStep, resolveStepRequirement, buildSteps, REQUIRED_STAFF_FIELDS };
