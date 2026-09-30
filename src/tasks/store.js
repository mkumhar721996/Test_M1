const crypto = require('crypto');

const tasks = new Map();

function createTask(data) {
  const task = { ...data, id: crypto.randomUUID() };
  tasks.set(task.id, task);
  return task;
}

function getTask(id) {
  return tasks.get(id);
}

function listTasks(filter = {}) {
  const all = Array.from(tasks.values());
  if (!filter.runId) return all;
  return all.filter((task) => task.runId === filter.runId);
}

module.exports = { createTask, getTask, listTasks };
