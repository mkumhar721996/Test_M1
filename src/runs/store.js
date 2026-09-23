const crypto = require('crypto');

const runs = new Map();

function createRun({ assignedCoordinatorId, state = 'started', tasks = [] }) {
  const run = {
    id: crypto.randomUUID(),
    state,
    assignedCoordinatorId,
    tasks: tasks.map((t) => ({ ...t })),
    auditLog: [],
  };
  runs.set(run.id, run);
  return run;
}

function getRun(id) {
  return runs.get(id);
}

module.exports = { createRun, getRun };
