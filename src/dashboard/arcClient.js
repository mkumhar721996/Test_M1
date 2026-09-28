let seq = 0;

async function fetchPipelineStatus() {
  seq += 1;
  return [
    { hireId: 'hire_2031', name: 'Jordan Reyes', stage: 'offer', updatedAt: new Date().toISOString() },
  ];
}

module.exports = { fetchPipelineStatus };
