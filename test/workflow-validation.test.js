const { validateWorkflowDefinition } = require('../src/workflows/validation');

test('AC6: a sequencing rule referencing an unknown task id is reported by field', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'a' }],
    sequencing: [{ from: 'a', to: 'missing_task' }],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'sequencing[0].to', message: expect.stringContaining('missing_task') }),
  ]));
});

test('AC6: a branch referencing an unknown task id is reported by field', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'a' }],
    branches: [{ from: 'a', whenTrue: 'missing_task' }],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'branches[0].whenTrue', message: expect.stringContaining('missing_task') }),
  ]));
});

test('AC6: a duplicate task id is reported', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'a' }, { id: 'a' }],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'tasks[1].id', message: expect.stringContaining('duplicate') }),
  ]));
});

test('a valid definition produces no errors', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'send_offer' }, { id: 'collect_docs' }],
    sequencing: [{ from: 'send_offer', to: 'collect_docs' }],
  });
  expect(errors).toEqual([]);
});

test('a definition with no tasks is reported as invalid', () => {
  const errors = validateWorkflowDefinition({ tasks: [] });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'tasks' }),
  ]));
});

test('AC6: a null sequencing entry is reported by field instead of throwing', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'a' }],
    sequencing: [null],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'sequencing[0]' }),
  ]));
});

test('AC6: a null branch entry is reported by field instead of throwing', () => {
  const errors = validateWorkflowDefinition({
    tasks: [{ id: 'a' }],
    branches: [null],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'branches[0]' }),
  ]));
});
