const counters = new Map();
const durations = new Map();

function statusClass(statusCode) {
  return `${Math.floor(statusCode / 100)}xx`;
}

function routeTemplate(req) {
  const routePath = req.route ? req.route.path : req.path;
  return `${req.baseUrl}${routePath === '/' ? '' : routePath}` || req.baseUrl;
}

function bump(map, key, amount) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { count: 1, sumMs: amount === undefined ? 0 : amount });
    return;
  }
  existing.count += 1;
  if (amount !== undefined) existing.sumMs += amount;
}

function requestMetrics(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const route = routeTemplate(req);
    const label = `${req.method} ${route} ${statusClass(res.statusCode)}`;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    bump(counters, label);
    bump(durations, `${req.method} ${route}`, durationMs);
  });
  next();
}

function getRequestCounts() {
  return Object.fromEntries(Array.from(counters, ([label, v]) => [label, v.count]));
}

function getRequestDurations() {
  return Object.fromEntries(
    Array.from(durations, ([label, v]) => [label, { count: v.count, avgMs: v.sumMs / v.count }]),
  );
}

function resetMetrics() {
  counters.clear();
  durations.clear();
}

module.exports = {
  requestMetrics, getRequestCounts, getRequestDurations, resetMetrics,
};
