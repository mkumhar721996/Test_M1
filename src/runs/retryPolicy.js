const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 30000;

function computeBackoffMs(attempt) {
  return BASE_BACKOFF_MS * 4 ** (attempt - 1);
}

module.exports = { MAX_ATTEMPTS, BASE_BACKOFF_MS, computeBackoffMs };
