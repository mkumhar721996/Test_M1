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

function getRun(tenantId, runId) {
  const run = runs.get(runId);
  if (!run || run.tenantId !== tenantId) return undefined;
  return run;
}

module.exports = { startRun, getRun };
