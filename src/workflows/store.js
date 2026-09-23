const crypto = require('crypto');
const { validateWorkflowDefinition } = require('./validation');

const tenants = new Map(); // tenantId -> Map<workflowId, VersionRecord[]>

function getTenantWorkflows(tenantId) {
  if (!tenants.has(tenantId)) tenants.set(tenantId, new Map());
  return tenants.get(tenantId);
}

function saveWorkflow({ tenantId, workflowId, definition, actor }) {
  const errors = validateWorkflowDefinition(definition);
  if (errors.length > 0) {
    const err = new Error('workflow definition is invalid');
    err.code = 'VALIDATION_ERROR';
    err.details = errors;
    throw err;
  }
  const workflows = getTenantWorkflows(tenantId);
  const id = workflowId || crypto.randomUUID();
  const versions = workflows.get(id) || [];
  const record = {
    id,
    version: versions.length + 1,
    definition,
    savedBy: actor,
    savedAt: new Date().toISOString(),
  };
  workflows.set(id, [...versions, record]);
  return record;
}

function getLatestVersion(tenantId, workflowId) {
  const versions = getTenantWorkflows(tenantId).get(workflowId);
  return versions && versions.length > 0 ? versions[versions.length - 1] : undefined;
}

function getVersion(tenantId, workflowId, version) {
  const versions = getTenantWorkflows(tenantId).get(workflowId);
  return versions ? versions.find((v) => v.version === version) : undefined;
}

module.exports = { saveWorkflow, getLatestVersion, getVersion };
