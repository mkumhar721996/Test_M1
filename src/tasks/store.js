const crypto = require('crypto');

const tasks = new Map();

function seedTask({ id, name, status } = {}) {
  const iso = new Date().toISOString();
  const task = {
    id: id || crypto.randomUUID(),
    name,
    status,
    createdAt: iso,
    updatedAt: iso,
  };
  tasks.set(task.id, task);
  return task;
}

function getTask(id) {
  return tasks.get(id);
}

function updateTask(id, changes) {
  const task = tasks.get(id);
  if (!task) return undefined;
  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...rest } = changes;
  Object.assign(task, rest);
  task.updatedAt = new Date().toISOString();
  return task;
}

module.exports = {
  seedTask,
  getTask,
  updateTask,
};
