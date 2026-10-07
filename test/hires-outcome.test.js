const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, updateHire, deactivateHire, reactivateHire, markHireOutcome } = require('../src/hires/store');

const base = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II' };
const mk = (extra = {}) => createHire({ ...base, hireStage: 'applied', ...extra });

test('AC1: an active candidate at Screening can be marked Rejected', async () => {
  const hire = await mk({ hireStage: 'screening', hiringManager: 'mgr_1' });
  const updated = await markHireOutcome(hire.id, 'rejected', 'Not a fit');
  expect(updated.profileStatus).toBe('rejected');
  expect(getHire(hire.id).profileStatus).toBe('rejected');
});

test.each(['hr', 'manager'])('AC1: POST /hires/:id/withdraw as %s marks the record Withdrawn', async (role) => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  const res = await request(app).post(`/hires/${hire.id}/withdraw`).set('x-staff-role', role).send({ reason: 'Accepted another offer' });
  expect(res.status).toBe(200);
  expect(res.body.profileStatus).toBe('withdrawn');
});

test.each(['rejected', 'withdrawn'])('AC2: reactivating a %s hire is blocked with a field-level 400', async (outcome) => {
  const hire = await mk({ hireStage: 'applied' });
  await markHireOutcome(hire.id, outcome, '');
  await expect(reactivateHire(hire.id)).rejects.toMatchObject({
    statusCode: 400,
    fields: { profileStatus: expect.stringContaining('Cannot reactivate') },
  });
  expect(getHire(hire.id).profileStatus).toBe(outcome);
});

test.each(['rejected', 'withdrawn'])('AC2: POST /hires/:id/reactivate on a %s hire returns a field-level 400', async (outcome) => {
  const hire = await mk({ hireStage: 'applied' });
  await markHireOutcome(hire.id, outcome, '');
  const res = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'hr').send({});
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('Cannot reactivate') } });
});

test.each(['rejected', 'withdrawn'])('AC3: advancing a %s hire is blocked with a field-level 400', async (outcome) => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  await markHireOutcome(hire.id, outcome, '');
  await expect(updateHire(hire.id, { hireStage: 'offer_extended' })).rejects.toMatchObject({
    statusCode: 400,
    fields: { hireStage: expect.stringContaining('final outcome') },
  });
  expect(getHire(hire.id).hireStage).toBe('interview');
});

test.each(['reject', 'withdraw'])('AC4: POST /hires/:id/%s on a deactivated hire returns 400', async (action) => {
  const hire = await mk({ hireStage: 'applied' });
  await deactivateHire(hire.id);
  const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'hr').send({});
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('deactivated') } });
  expect(getHire(hire.id).profileStatus).toBe('deactivated');
});

test('marking an at-Offer candidate Rejected is blocked', async () => {
  const hire = await mk({ hireStage: 'offer_extended', hiringManager: 'mgr_1' });
  await expect(markHireOutcome(hire.id, 'rejected', '')).rejects.toMatchObject({
    statusCode: 400,
    fields: { profileStatus: expect.stringContaining('Offer stage') },
  });
});

test('marking an already-closed candidate is blocked', async () => {
  const hire = await mk({ hireStage: 'applied' });
  await markHireOutcome(hire.id, 'rejected', '');
  await expect(markHireOutcome(hire.id, 'withdrawn', '')).rejects.toMatchObject({ statusCode: 400 });
  expect(getHire(hire.id).profileStatus).toBe('rejected');
});

test.each(['reject', 'withdraw'])('AC5: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
  const hire = await mk({ hireStage: 'applied' });
  const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
  expect(res.status).toBe(403);
  expect(getHire(hire.id).profileStatus).toBe('active');
});

test('marking an outcome cancels any in-flight onboarding run', async () => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  const stored = getHire(hire.id);
  stored.run = { id: 'run_legacy', status: 'active' };
  const updated = await markHireOutcome(hire.id, 'withdrawn', '');
  expect(updated.run).toBeNull();
  expect(updated.runHistory[updated.runHistory.length - 1]).toMatchObject({ id: 'run_legacy', status: 'cancelled' });
});
