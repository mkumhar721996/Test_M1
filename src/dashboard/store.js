const arcClient = require('./arcClient');

const SIGNIFICANT_STALENESS_MS = 24 * 60 * 60 * 1000;

let cache = null;

async function getDashboardData() {
  try {
    const data = await arcClient.fetchPipelineStatus();
    cache = { data, lastFetchedAt: new Date().toISOString() };
    return { data, stale: false, lastFetchedAt: cache.lastFetchedAt, significantlyStale: false };
  } catch (err) {
    if (!cache) throw err;
    const ageMs = Date.now() - new Date(cache.lastFetchedAt).getTime();
    return {
      data: cache.data,
      stale: true,
      lastFetchedAt: cache.lastFetchedAt,
      significantlyStale: ageMs > SIGNIFICANT_STALENESS_MS,
    };
  }
}

module.exports = { getDashboardData, SIGNIFICANT_STALENESS_MS };
