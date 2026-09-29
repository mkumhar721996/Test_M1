const { listHires } = require('../hires/store');
const { buildDashboard } = require('./bottleneck');

function getDashboard(now = new Date()) {
  return buildDashboard(listHires(), now);
}

module.exports = { getDashboard };
