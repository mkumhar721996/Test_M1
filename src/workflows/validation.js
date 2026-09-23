function validateWorkflowDefinition(definition) {
  const errors = [];
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return [{ field: 'definition', message: 'definition must be an object' }];
  }

  const tasks = Array.isArray(definition.tasks) ? definition.tasks : [];
  if (tasks.length === 0) {
    errors.push({ field: 'tasks', message: 'at least one task is required' });
  }

  const taskIds = new Set();
  tasks.forEach((task, i) => {
    if (!task || typeof task.id !== 'string' || task.id === '') {
      errors.push({ field: `tasks[${i}].id`, message: 'task id must be a non-empty string' });
      return;
    }
    if (taskIds.has(task.id)) {
      errors.push({ field: `tasks[${i}].id`, message: `duplicate task id "${task.id}"` });
    }
    taskIds.add(task.id);
  });

  const sequencing = Array.isArray(definition.sequencing) ? definition.sequencing : [];
  sequencing.forEach((rule, i) => {
    if (!taskIds.has(rule.from)) {
      errors.push({ field: `sequencing[${i}].from`, message: `references unknown task id "${rule.from}"` });
    }
    if (!taskIds.has(rule.to)) {
      errors.push({ field: `sequencing[${i}].to`, message: `references unknown task id "${rule.to}"` });
    }
  });

  const branches = Array.isArray(definition.branches) ? definition.branches : [];
  branches.forEach((branch, i) => {
    ['from', 'whenTrue', 'whenFalse'].forEach((key) => {
      const value = branch[key];
      if (value !== undefined && !taskIds.has(value)) {
        errors.push({ field: `branches[${i}].${key}`, message: `references unknown task id "${value}"` });
      }
    });
  });

  return errors;
}

module.exports = { validateWorkflowDefinition };
