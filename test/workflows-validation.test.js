const { validateTaskGraph, WorkflowValidationError } = require('../src/workflows/validation');

function fieldsOf(graph) {
  try {
    validateTaskGraph(graph);
  } catch (err) {
    expect(err).toBeInstanceOf(WorkflowValidationError);
    return err.fields;
  }
  throw new Error('expected validateTaskGraph to throw');
}

test('AC6: a next entry referencing an unknown task id is reported by field', () => {
  expect(fieldsOf({ tasks: [{ id: 't1', next: ['missing'] }] })['tasks[0].next[0]']).toMatch(/missing/);
});

test('AC6: empty or missing tasks are rejected', () => {
  expect(fieldsOf({ tasks: [] }).tasks).toBeDefined();
  expect(fieldsOf(undefined).tasks).toBeDefined();
});

test('AC6: duplicate and blank task ids are reported', () => {
  const fields = fieldsOf({ tasks: [{ id: 'a' }, { id: 'a' }, { id: ' ' }] });
  expect(fields['tasks[1].id']).toMatch(/Duplicate/);
  expect(fields['tasks[2].id']).toBeDefined();
});

test('AC6: a non-array next is reported', () => {
  expect(fieldsOf({ tasks: [{ id: 'a', next: 'b' }] })['tasks[0].next']).toBeDefined();
});

test('AC6: conditional branches referencing unknown tasks are reported', () => {
  const fields = fieldsOf({ tasks: [{ id: 'a', branch: { whenTrue: 'x', whenFalse: 'a' } }] });
  expect(fields['tasks[0].branch.whenTrue']).toMatch(/x/);
  expect(fields['tasks[0].branch.whenFalse']).toBeUndefined();
  expect(fieldsOf({ tasks: [{ id: 'a', branch: [] }] })['tasks[0].branch']).toBeDefined();
});

test('a valid graph with branches passes', () => {
  expect(() => validateTaskGraph({ tasks: [{ id: 'a', next: ['b'], branch: { whenTrue: 'b', whenFalse: 'c' } }, { id: 'b' }, { id: 'c' }] })).not.toThrow();
});
