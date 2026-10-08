const crypto = require('crypto');
const { validateTaskGraph } = require('./validation');

const workflows = new Map(); // id -> { id, projectId, versions: [{ version, taskGraph, savedBy, savedAt }] }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWorkflow(taskGraph, { projectId = '', actor = 'System' } = {}) {
  validateTaskGraph(taskGraph);
  const id = crypto.randomUUID();
  const entry = { version: 1, taskGraph: clone(taskGraph), savedBy: actor, savedAt: new Date().toISOString() };
  workflows.set(id, { id, projectId, versions: [entry] });
  return getVersion(id, 1);
}

function updateWorkflow(workflowId, taskGraph, { actor = 'System' } = {}) {
  const workflow = workflows.get(workflowId);
  if (!workflow) return undefined;
  validateTaskGraph(taskGraph);
  const version = workflow.versions.length + 1;
  workflow.versions.push({ version, taskGraph: clone(taskGraph), savedBy: actor, savedAt: new Date().toISOString() });
  return getVersion(workflowId, version);
}

function getLatestVersion(workflowId) {
  const workflow = workflows.get(workflowId);
  if (!workflow) return undefined;
  return getVersion(workflowId, workflow.versions.length);
}

function getVersion(workflowId, version) {
  const workflow = workflows.get(workflowId);
  if (!workflow) return undefined;
  const found = workflow.versions.find((v) => v.version === version);
  return found
    ? {
        workflowId,
        version: found.version,
        taskGraph: clone(found.taskGraph),
        projectId: workflow.projectId,
        savedBy: found.savedBy,
        savedAt: found.savedAt,
      }
    : undefined;
}

module.exports = { createWorkflow, updateWorkflow, getLatestVersion, getVersion };
