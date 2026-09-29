const { listHires } = require('../hires/store');
const { buildDashboard } = require('./bottleneck');

// TEMPORARY, NOT REAL SECURITY: this app has no session/login system anywhere (no req.user,
// no cookie, no token verification on any route), so there is nothing genuine to check a
// role against. This header-based gate only stops a browser that doesn't know to send the
// header — it does NOT stop a deliberate attacker, who can set 'x-staff-role: hr_admin'
// themselves. It exists only because leaving /dashboard fully open is worse (it exposes
// hiring data to zero-effort scraping), and removing all access control was itself flagged
// as unacceptable. The real fix is session-based authentication applied across the whole
// app, which is a dedicated cross-cutting initiative out of scope for this story.
const ROLE_PERMISSIONS = {
  hr_admin: true,
};

function canViewDashboard(role) {
  return ROLE_PERMISSIONS[role] === true;
}

function getDashboard(now = new Date()) {
  return buildDashboard(listHires(), now);
}

module.exports = { getDashboard, canViewDashboard };
