const ALLOWED_START_ROLES = ['hr_coordinator', 'hiring_manager', 'platform_admin'];

function getActor(req) {
  return {
    tenantId: req.header('x-tenant-id'),
    role: req.header('x-actor-role'),
  };
}

module.exports = { getActor, ALLOWED_START_ROLES };
