const crypto = require('crypto');
const { getVersionToPin } = require('../workflows/store');

const ACTIVE_STATUSES = ['started', 'paused', 'blocked'];
const runsById = new Map();

class DuplicateActiveRunError extends Error {
  constructor(existingRunId) {
    super('An active Run already exists for this hire.');
    this.code = 'DUPLICATE_ACTIVE_RUN';
    this.existingRunId = existingRunId;
  }
}

function listRunsForHire(tenantId, hireId) {
  return [...runsById.values()].filter(
    (run) => run.tenantId === tenantId && run.hireId === hireId
  );
}

function findActiveRunForHire(tenantId, hireId) {
  return listRunsForHire(tenantId, hireId).find((run) => ACTIVE_STATUSES.includes(run.status));
}

function startRun({ tenantId, hireId }) {
  const existingActive = findActiveRunForHire(tenantId, hireId);
  if (existingActive) {
    throw new DuplicateActiveRunError(existingActive.id);
  }
  const versionToPin = getVersionToPin(tenantId);
  const run = {
    id: crypto.randomUUID(),
    tenantId,
    hireId,
    workflowDefinitionVersionId: versionToPin ? versionToPin.id : null,
    status: 'started',
    createdAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return run;
}

function getRun(id) {
  return runsById.get(id);
}

module.exports = { startRun, getRun, listRunsForHire, DuplicateActiveRunError, ACTIVE_STATUSES };
