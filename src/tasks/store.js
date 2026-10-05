const crypto = require('crypto');

const tasks = new Map();

function createTask(data = {}) {
  const task = { ...data, id: crypto.randomUUID() };
  tasks.set(task.id, task);
  return task;
}

function getTask(id) {
  return tasks.get(id);
}

function listTasks({ runId } = {}) {
  const all = Array.from(tasks.values());
  if (!runId) return all;
  return all.filter((task) => task.runId === runId);
}

function clearTasks() {
  tasks.clear();
}

module.exports = { createTask, getTask, listTasks, clearTasks };
