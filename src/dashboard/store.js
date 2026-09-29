const { listHires } = require('../hires/store');
const { buildDashboard } = require('./bottleneck');

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
