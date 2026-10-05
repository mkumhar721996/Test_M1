const crypto = require('crypto');
const { getLatestVersion, createWorkflow } = require('../workflows/store');
const { createEmployee } = require('../employees/store');
const { appendOnboardingAuditEntry } = require('../hires/store');
const { fireBlockedStepAlert } = require('../notifications/store');

const runs = new Map();

const REQUIRED_STAFF_FIELDS = ['name', 'email', 'department', 'role', 'startDate'];

function buildSteps(taskGraph) {
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

  return ordered.map((t, i) => ({
    id: t.id,
    name: t.name || t.id,
    description: t.description || '',
    owner: t.owner || '',
    ownerName: t.ownerName || '',
    ownerTitle: t.ownerTitle || '',
    ownerEmail: t.ownerEmail || '',
    status: i === 0 ? 'current' : 'upcoming',
    requirementLabel: t.requirement ? t.requirement.label : undefined,
    requirementMet: t.requirement ? Boolean(t.requirement.metByDefault) : undefined,
    blockReason: t.requirement ? t.requirement.blockReason : undefined,
  }));
}

function startRun(workflowId, hireId = null) {
  const definition = getLatestVersion(workflowId);
  if (!definition) return undefined;
  const steps = buildSteps(definition.taskGraph);
  const startedAt = new Date().toISOString();
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    definitionVersion: definition.version,
    taskGraph: definition.taskGraph,
    notifyRecipients: (definition.taskGraph && definition.taskGraph.notifyRecipients) || { hr: null, managers: [] },
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
    if (!wasBlocked) fireBlockedStepAlert(run, step);
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
    notifyRecipients: {
      hr: { name: 'Priya Shah', email: 'priya.shah@onboardco.example' },
      managers: [
        { name: 'Morgan Ellis', email: 'morgan.ellis@onboardco.example' },
        { name: 'Alex Chen', email: 'alex.chen@onboardco.example' },
      ],
    },
    tasks: [
      { id: 'step_offer_letter', name: 'Collect signed offer letter', description: 'Confirm Jordan has returned a signed copy of the offer letter.', owner: 'HR — Priya Shah', ownerName: 'Priya Shah', ownerTitle: 'HR Partner', ownerEmail: 'priya.shah@onboardco.example', next: ['step_i9'] },
      {
        id: 'step_i9',
        name: 'Verify I-9 employment eligibility',
        description: 'Confirm the required I-9 supporting document has been uploaded and reviewed.',
        owner: 'HR — Priya Shah',
        ownerName: 'Priya Shah', ownerTitle: 'HR Partner', ownerEmail: 'priya.shah@onboardco.example', 
        requirement: { label: 'I-9 supporting document', blockReason: 'Required document missing — Jordan has not yet uploaded I-9 supporting documentation.' },
        next: ['step_it'],
      },
      { id: 'step_it', name: 'Provision IT accounts & equipment', description: 'Assign a laptop and create system accounts.', owner: 'IT — Devon Ruiz', ownerName: 'Devon Ruiz', ownerTitle: 'IT Systems', ownerEmail: 'devon.ruiz@onboardco.example', next: ['step_orientation'] },
      { id: 'step_orientation', name: 'Assign onboarding buddy & complete orientation', description: 'Pair Jordan with a buddy and confirm orientation attendance.', owner: 'Manager — Morgan Ellis', ownerName: 'Morgan Ellis', ownerTitle: 'Hiring Manager', ownerEmail: 'morgan.ellis@onboardco.example', next: ['step_checkin'] },
      { id: 'step_checkin', name: 'Manager check-in & 30-day goals sign-off', description: 'Document 30-day goals and confirm manager sign-off.', owner: 'Manager — Morgan Ellis', ownerName: 'Morgan Ellis', ownerTitle: 'Hiring Manager', ownerEmail: 'morgan.ellis@onboardco.example', next: [] },
    ],
  });
  const run = startRun(workflow.workflowId, 'hire_2031');
  advanceStep(run.id);
}

seedExampleRun();

module.exports = { startRun, getRun, listRuns, completeRun, advanceStep, resolveStepRequirement, buildSteps, REQUIRED_STAFF_FIELDS };
