const crypto = require('crypto');

const workflows = new Map(); // id -> { id, versions: [{ version, taskGraph }] }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWorkflow(taskGraph) {
  const id = crypto.randomUUID();
  workflows.set(id, { id, versions: [{ version: 1, taskGraph: clone(taskGraph) }] });
  return getVersion(id, 1);
}

function updateWorkflow(workflowId, taskGraph) {
  const workflow = workflows.get(workflowId);
  if (!workflow) return undefined;
  const version = workflow.versions.length + 1;
  workflow.versions.push({ version, taskGraph: clone(taskGraph) });
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
  return found ? { workflowId, version: found.version, taskGraph: clone(found.taskGraph) } : undefined;
}

module.exports = { createWorkflow, updateWorkflow, getLatestVersion, getVersion };
