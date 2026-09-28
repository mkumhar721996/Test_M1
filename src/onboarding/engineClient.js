let seq = 0;

async function triggerRun({ hireId, department, role }) {
  seq += 1;
  const id = `run_${7200 + seq}`;
  return {
    id,
    hireId,
    department,
    role,
    status: 'active',
    startedAt: new Date().toISOString(),
    tasksDone: 0,
    arcRunUrl: `https://arc.example.com/runs/${id}/eval`,
  };
}

async function cancelRun(runId) {
  return { id: runId, status: 'cancelled' };
}

module.exports = { triggerRun, cancelRun };
