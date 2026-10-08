const crypto = require('crypto');

const entries = [];

function recordAuditEntry({ tenant, actorName, actorRole, action, targetId, targetName, result, detail }) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    tenant,
    actorName,
    actorRole,
    action,
    targetId,
    targetName,
    result,
    detail,
  };
  entries.unshift(entry);
  return entry;
}

function listAuditLogForTenant(tenant) {
  return entries.filter((e) => e.tenant === tenant);
}

module.exports = { recordAuditEntry, listAuditLogForTenant };
