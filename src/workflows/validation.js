class WorkflowValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function validateTaskGraph(taskGraph) {
  const fields = {};
  const tasks = taskGraph && Array.isArray(taskGraph.tasks) ? taskGraph.tasks : null;
  if (!tasks || tasks.length === 0) {
    throw new WorkflowValidationError('validation_error', { tasks: 'At least one task is required.' });
  }
  const ids = new Set();
  tasks.forEach((task, i) => {
    if (!task || typeof task.id !== 'string' || task.id.trim() === '') {
      fields[`tasks[${i}].id`] = 'Task id must be a non-empty string.';
      return;
    }
    if (ids.has(task.id)) fields[`tasks[${i}].id`] = `Duplicate task id "${task.id}".`;
    ids.add(task.id);
  });
  tasks.forEach((task, i) => {
    if (!task) return;
    if (task.next !== undefined) {
      if (!Array.isArray(task.next)) {
        fields[`tasks[${i}].next`] = 'next must be an array of task ids.';
      } else {
        task.next.forEach((targetId, j) => {
          if (typeof targetId !== 'string') fields[`tasks[${i}].next[${j}]`] = 'Task reference must be a string.';
          else if (!ids.has(targetId)) fields[`tasks[${i}].next[${j}]`] = `References unknown task id "${targetId}".`;
        });
      }
    }
    if (task.branch !== undefined) {
      const branch = task.branch;
      if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
        fields[`tasks[${i}].branch`] = 'branch must be an object.';
      } else {
        ['whenTrue', 'whenFalse'].forEach((key) => {
          const targetId = branch[key];
          if (targetId === undefined) return;
          if (typeof targetId !== 'string') fields[`tasks[${i}].branch.${key}`] = 'Task reference must be a string.';
          else if (!ids.has(targetId)) fields[`tasks[${i}].branch.${key}`] = `References unknown task id "${targetId}".`;
        });
      }
    }
  });
  if (Object.keys(fields).length > 0) throw new WorkflowValidationError('validation_error', fields);
}

module.exports = { WorkflowValidationError, validateTaskGraph };
