const crypto = require('crypto');
const { getRun } = require('../runs/store');

const tasks = new Map();

class TaskValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 422;
    this.fields = fields;
  }
}

function createTask(data) {
  const runId = data && data.runId;
  if (!runId) {
    throw new TaskValidationError('validation_error', { runId: 'runId is required.' });
  }
  if (!getRun(runId)) {
    throw new TaskValidationError('validation_error', { runId: 'runId does not correspond to an existing run.' });
  }
  const task = { id: crypto.randomUUID(), runId };
  tasks.set(task.id, task);
  return task;
}

function listTasks() {
  return Array.from(tasks.values());
}

module.exports = { TaskValidationError, createTask, listTasks };
