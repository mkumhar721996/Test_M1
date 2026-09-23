const { createHire, getHire, updateHire, deactivateHire, reactivateHire } = require('../src/hires/store');

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
