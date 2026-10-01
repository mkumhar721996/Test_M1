const { createHire, getHire, updateHire, deactivateHire, reactivateHire, HireValidationError } = require('../src/hires/store');

test('AC1: creating a profile with hireStage "offer_accepted" triggers an onboarding Run', async () => {
  const hire = await createHire({
    name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '(312) 555-0148',
    startDate: '2026-10-05', department: 'Engineering', role: 'Software Engineer II',
    hireStage: 'offer_accepted',
  });
  expect(getHire(hire.id).run).toMatchObject({ status: 'active', department: 'Engineering', role: 'Software Engineer II' });
  expect(getHire(hire.id).run.id).toBeTruthy();
});

test('AC1: updating a draft profile to "offer_accepted" triggers an onboarding Run', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' });
  expect(getHire(hire.id).run).toBeNull();
  const updated = await updateHire(hire.id, { hireStage: 'offer_accepted' });
  expect(updated.run).toMatchObject({ status: 'active', department: 'Sales', role: 'AE' });
});

test('AC2: changing role or department on an active Run cancels the existing Run', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const originalRunId = getHire(hire.id).run.id;
  const updated = await updateHire(hire.id, { department: 'Product', role: 'Product Manager' });
  expect(updated.runHistory).toContainEqual(expect.objectContaining({ id: originalRunId, status: 'cancelled', reason: 'role_or_department_changed' }));
});

test('AC3: changing role or department starts a new Run reflecting the update', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const originalRunId = getHire(hire.id).run.id;
  const updated = await updateHire(hire.id, { department: 'Product', role: 'Product Manager' });
  expect(updated.run.id).not.toBe(originalRunId);
  expect(updated.run).toMatchObject({ status: 'active', department: 'Product', role: 'Product Manager' });
});

test('AC4: changing start date, name, or contact details leaves the active Run unaffected', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const before = getHire(hire.id).run;
  const updated = await updateHire(hire.id, { name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
  expect(updated.run).toEqual(before);
});

test('AC5: the profile reflects updated start date, name, and contact values', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const updated = await updateHire(hire.id, { name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
  expect(updated).toMatchObject({ name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
});

test('AC6: deactivating a profile cancels its active Run', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const runId = getHire(hire.id).run.id;
  const updated = await deactivateHire(hire.id);
  expect(updated.run).toBeNull();
  expect(updated.profileStatus).toBe('deactivated');
  expect(updated.runHistory).toContainEqual(expect.objectContaining({ id: runId, status: 'cancelled', reason: 'profile_deactivated' }));
});

test('AC7: reactivating a deactivated profile starts a fresh Run from the beginning', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  await deactivateHire(hire.id);
  const updated = await reactivateHire(hire.id);
  expect(updated.run).toMatchObject({ status: 'active', tasksDone: 0, freshStart: true });
});

test('AC8: the previously cancelled Run is not resumed on reactivation', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
  const cancelledRunId = getHire(hire.id).run.id;
  await deactivateHire(hire.id);
  const updated = await reactivateHire(hire.id);
  expect(updated.run.id).not.toBe(cancelledRunId);
  expect(updated.runHistory.find((r) => r.id === cancelledRunId)).toMatchObject({ status: 'cancelled' });
});

test('TEST-M1-STORY-136 AC2: createHire sets profileStatus active on a valid submission', async () => {
  const hire = await createHire({ name: 'Sam Lee', email: 's@x.com', phone: '5551234567',
    department: 'Engineering', role: 'Engineer', startDate: '2026-11-01', hireStage: 'draft' }, 'Morgan Ellis');
  expect(hire.profileStatus).toBe('active');
});

test('TEST-M1-STORY-136 AC3/AC4: deactivating an active candidate sets deactivated and cancels the run', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' }, 'Morgan Ellis');
  const updated = await deactivateHire(hire.id, 'Morgan Ellis');
  expect(updated.profileStatus).toBe('deactivated');
  expect(updated.run).toBeNull();
});

test('TEST-M1-STORY-136 AC5: reactivating a deactivated candidate returns profileStatus to active', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' }, 'Morgan Ellis');
  await deactivateHire(hire.id, 'Morgan Ellis');
  const updated = await reactivateHire(hire.id, 'Morgan Ellis');
  expect(updated.profileStatus).toBe('active');
});

test('TEST-M1-STORY-136 AC5 edge case: reactivating a draft-stage candidate still starts a fresh run', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
  await deactivateHire(hire.id, 'Morgan Ellis');
  const updated = await reactivateHire(hire.id, 'Morgan Ellis');
  expect(updated.run).toMatchObject({ status: 'active', freshStart: true });
});

test('TEST-M1-STORY-136 AC6: editing a candidate applies last-write-wins', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
  const updated = await updateHire(hire.id, { name: 'A B', role: 'Senior Engineer' }, 'Morgan Ellis');
  expect(updated).toMatchObject({ name: 'A B', role: 'Senior Engineer' });
});

test('TEST-M1-STORY-136 AC7: creating a candidate appends a { ts, actor, action } auditLog entry', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
  expect(hire.auditLog).toEqual([
    expect.objectContaining({ ts: expect.any(String), actor: 'Morgan Ellis', action: 'created candidate' }),
  ]);
});

test('TEST-M1-STORY-136 AC7 edge case: an undefined actor does not throw and still logs an entry', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }); // no actor passed
  expect(hire.auditLog[0]).toMatchObject({ action: 'created candidate' });
  expect(hire.auditLog[0].actor).toBeUndefined();
});

test('TEST-M1-STORY-136 AC8: deactivating an already-deactivated candidate is blocked and unchanged', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
  await deactivateHire(hire.id, 'Morgan Ellis');
  const auditLenBefore = getHire(hire.id).auditLog.length;
  const result = await deactivateHire(hire.id, 'Morgan Ellis');
  expect(result.profileStatus).toBe('deactivated');
  expect(getHire(hire.id).auditLog.length).toBe(auditLenBefore);
});

test('TEST-M1-STORY-136 edge case: deactivate/reactivate/update on an unknown id resolve undefined, not throw', async () => {
  await expect(deactivateHire('does-not-exist', 'Morgan Ellis')).resolves.toBeUndefined();
  await expect(reactivateHire('does-not-exist', 'Morgan Ellis')).resolves.toBeUndefined();
  await expect(updateHire('does-not-exist', { name: 'X' }, 'Morgan Ellis')).resolves.toBeUndefined();
});

test('TEST-M1-STORY-136 AC9: updateHire rejects a malformed email and leaves the record unchanged', async () => {
  const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
  await expect(updateHire(hire.id, { email: 'not-an-email' }, 'Morgan Ellis')).rejects.toThrow(HireValidationError);
  expect(getHire(hire.id).email).toBe('a@x.com');
});

test('TEST-M1-STORY-136 AC9 edge case: multiple invalid fields are all reported together', async () => {
  await expect(createHire({ name: '', email: 'not-an-email', phone: '5551234567', department: '',
    role: 'Engineer', startDate: '2026-10-05' })).rejects.toMatchObject({
      fields: { name: expect.any(String), email: expect.any(String), department: expect.any(String) },
    });
});

test('security: a non-string email/name is rejected as a validation error, not a crash', async () => {
  expect.assertions(2);
  try {
    await createHire({ name: { x: 1 }, email: ['a@x.com'], phone: '5551234567',
      department: 'Engineering', role: 'Engineer', startDate: '2026-10-05' });
  } catch (err) {
    expect(err).toBeInstanceOf(HireValidationError);
    expect(err.fields).toMatchObject({ name: expect.any(String), email: expect.any(String) });
  }
});

test('security: an out-of-enum hireStage is rejected by createHire', async () => {
  await expect(createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
    department: 'Engineering', role: 'Engineer II', hireStage: 'not_a_real_stage' }))
    .rejects.toMatchObject({ fields: { hireStage: expect.any(String) } });
});
