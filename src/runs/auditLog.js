const crypto = require('crypto');

const events = [];

function record(event) {
  const entry = Object.freeze({ id: crypto.randomUUID(), ...event });
  events.push(entry);
  return entry;
}

function list() {
  return [...events].reverse();
}

function listForRun(runId) {
  return list().filter((e) => e.runId === runId);
}

module.exports = { record, list, listForRun };
