let seq = 0;

async function triggerRun({ hireId, department, role }) {
  seq += 1;
  return {
    id: `run_${7200 + seq}`,
    hireId,
    department,
    role,
    status: 'active',
    startedAt: new Date().toISOString(),
    tasksDone: 0,
  };
}

async function cancelRun(runId) {
  return { id: runId, status: 'cancelled' };
}

module.exports = { triggerRun, cancelRun };
