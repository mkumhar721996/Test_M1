const crypto = require('crypto');
const { conditionsOverlap } = require('./conditions');

const workflows = new Map();

function createWorkflow(data) {
  const branches = data.branches || [];
  for (let i = 0; i < branches.length; i += 1) {
    for (let j = i + 1; j < branches.length; j += 1) {
      if (conditionsOverlap(branches[i].condition, branches[j].condition)) {
        const error = new Error(
          `Branch conditions "${branches[i].id}" and "${branches[j].id}" can both be satisfied by the same hire record`
        );
        error.code = 'VALIDATION_ERROR';
        throw error;
      }
    }
  }
  const workflow = { ...data, id: crypto.randomUUID() };
  workflows.set(workflow.id, workflow);
  return workflow;
}

function getWorkflow(id) {
  return workflows.get(id);
}

module.exports = { createWorkflow, getWorkflow };
