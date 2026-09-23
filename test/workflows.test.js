const crypto = require('crypto');
const { addDefinitionVersion, getVersionToPin } = require('../src/workflows/store');

test('AC2/AC13 helper: getVersionToPin prefers the current published version over drafts', () => {
  const tenantId = crypto.randomUUID();
  addDefinitionVersion(tenantId, { status: 'draft' });
  const published = addDefinitionVersion(tenantId, { status: 'published' });
  expect(getVersionToPin(tenantId).id).toBe(published.id);
});

test('AC14: the Run is pinned to the latest draft version when none is published', () => {
  const tenantId = crypto.randomUUID();
  addDefinitionVersion(tenantId, { status: 'draft' });
  const latestDraft = addDefinitionVersion(tenantId, { status: 'draft' });
  expect(getVersionToPin(tenantId).id).toBe(latestDraft.id);
});

test('a tenant with no Workflow definition versions at all resolves to null', () => {
  const tenantId = crypto.randomUUID();
  expect(getVersionToPin(tenantId)).toBeNull();
});
