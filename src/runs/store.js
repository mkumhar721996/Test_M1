const crypto = require('crypto');
const { getLatestVersion } = require('../workflows/store');
const { createEmployee } = require('../employees/store');

const runs = new Map();

const REQUIRED_STAFF_FIELDS = ['name', 'email', 'department', 'role', 'startDate'];

function startRun(workflowId) {
  const definition = getLatestVersion(workflowId);
  if (!definition) return undefined;
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    definitionVersion: definition.version,
    taskGraph: definition.taskGraph,
    status: 'in_progress',
    employeeId: null,
  };
  runs.set(run.id, run);
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

module.exports = { startRun, getRun, completeRun, REQUIRED_STAFF_FIELDS };
