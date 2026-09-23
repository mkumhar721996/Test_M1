const crypto = require('crypto');

const versionsByTenant = new Map();

function addDefinitionVersion(tenantId, { status = 'draft' } = {}) {
  const list = versionsByTenant.get(tenantId) || [];
  const version = {
    id: crypto.randomUUID(),
    tenantId,
    versionNumber: list.length + 1,
    status,
    createdAt: new Date().toISOString(),
  };
  list.push(version);
  versionsByTenant.set(tenantId, list);
  return version;
}

function getVersionToPin(tenantId) {
  const list = versionsByTenant.get(tenantId) || [];
  const published = list.filter((v) => v.status === 'published');
  if (published.length > 0) return published[published.length - 1];
  const drafts = list.filter((v) => v.status === 'draft');
  if (drafts.length > 0) return drafts[drafts.length - 1];
  return null;
}

module.exports = { addDefinitionVersion, getVersionToPin };
