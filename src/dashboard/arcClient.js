async function fetchPipelineStatus() {
  return [
    { hireId: 'hire_2031', name: 'Jordan Reyes', stage: 'offer', updatedAt: new Date().toISOString() },
  ];
}

module.exports = { fetchPipelineStatus };
