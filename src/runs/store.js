const crypto = require('crypto');
const { getLatestVersion } = require('../workflows/store');

const runs = new Map();

function startRun(workflowId) {
  const definition = getLatestVersion(workflowId);
  if (!definition) return undefined;
  const run = {
    id: crypto.randomUUID(),
    workflowId,
    definitionVersion: definition.version,
    taskGraph: definition.taskGraph,
  };
  runs.set(run.id, run);
  return run;
}

function getRun(runId) {
  return runs.get(runId);
}

module.exports = { startRun, getRun };
