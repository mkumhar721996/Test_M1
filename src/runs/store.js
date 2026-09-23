const crypto = require('crypto');
const { getLatestVersion } = require('../workflows/store');

const runs = new Map();

function startRun(tenantId, workflowId) {
  const definitionRecord = getLatestVersion(tenantId, workflowId);
  if (!definitionRecord) return undefined;
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    definitionVersion: definitionRecord.version,
    definition: definitionRecord.definition,
  };
  runs.set(run.id, run);
  return run;
}

function getRun(runId) {
  return runs.get(runId);
}

module.exports = { startRun, getRun };
