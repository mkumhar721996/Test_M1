const crypto = require('crypto');
const { getWorkflow } = require('../workflows/store');
const { evaluateCondition } = require('../workflows/conditions');
const { notifyHrCoordinator } = require('./notifications');

const runs = new Map();

function startRun({ workflowId, coordinatorId, hireAttributes }) {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return null;

  const evaluations = workflow.branches.map((branch) => ({
    branch,
    result: evaluateCondition(branch.condition, hireAttributes, workflow.hireAttributeSchema || []),
  }));

  const blocked = evaluations.find((e) => e.result === 'missing');
  if (blocked) {
    const reason = `Branch "${blocked.branch.id}" condition references "${blocked.branch.condition.attribute}", which is missing on this hire record`;
    const run = {
      id: crypto.randomUUID(),
      workflowId,
      coordinatorId,
      hireAttributes,
      status: 'blocked',
      blockedReason: reason,
      taskStatuses: {},
    };
    runs.set(run.id, run);
    notifyHrCoordinator(coordinatorId, run.id, reason);
    return run;
  }

  const matched = evaluations.find((e) => e.result === 'match');
  const taskStatuses = {};
  workflow.branches.forEach(({ id, taskIds }) => {
    const status = matched && matched.branch.id === id ? 'executed' : 'skipped';
    taskIds.forEach((taskId) => {
      taskStatuses[taskId] = status;
    });
  });
  (workflow.defaultTaskIds || []).forEach((taskId) => {
    taskStatuses[taskId] = matched ? 'skipped' : 'executed';
  });

  const run = {
    id: crypto.randomUUID(),
    workflowId,
    coordinatorId,
    hireAttributes,
    status: 'completed',
    taskStatuses,
  };
  runs.set(run.id, run);
  return run;
}

function getRun(id) {
  return runs.get(id);
}

module.exports = { startRun, getRun };
