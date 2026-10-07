const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, updateHire, deactivateHire, reactivateHire, rejectHire, withdrawHire } = require('../src/hires/store');

const base = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II' };
const mk = (extra = {}) => createHire({ ...base, hireStage: 'applied', ...extra });

test.each(['applied', 'screening', 'interview'])('AC1: marking an active %s-stage candidate as rejected sets profileStatus to rejected', async (stage) => {
  const hire = await mk({ hireStage: stage, hiringManager: stage === 'applied' ? undefined : 'mgr_1' });
  const updated = await rejectHire(hire.id, 'Not enough experience');
  expect(updated).toMatchObject({ profileStatus: 'rejected', outcomeReason: 'Not enough experience' });
});

test('AC1: POST /hires/:id/withdraw as HR sets profileStatus to withdrawn', async () => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  const res = await request(app).post(`/hires/${hire.id}/withdraw`).set('x-staff-role', 'hr').send({ reason: 'Accepted another offer' });
  expect(res.status).toBe(200);
  expect(res.body.profileStatus).toBe('withdrawn');
});

test('AC1: candidate at offer stage cannot be rejected', async () => {
  const hire = await mk({ hireStage: 'offer_extended', hiringManager: 'mgr_1' });
  await expect(rejectHire(hire.id)).rejects.toMatchObject({ statusCode: 400, fields: { profileStatus: expect.stringContaining('Offer') } });
});

test.each(['rejected', 'withdrawn'])('AC2: reactivating a %s hire is blocked with a field-level 400', async (outcome) => {
  const hire = await mk({ hireStage: 'applied' });
  await (outcome === 'rejected' ? rejectHire(hire.id) : withdrawHire(hire.id));
  await expect(reactivateHire(hire.id)).rejects.toMatchObject({ statusCode: 400, fields: { profileStatus: expect.stringContaining('Cannot reactivate') } });
  expect(getHire(hire.id).profileStatus).toBe(outcome);
});

test.each(['rejected', 'withdrawn'])('AC3: advancing a %s hire to another stage is blocked with a field-level 400', async (outcome) => {
  const hire = await mk({ hireStage: 'screening', hiringManager: 'mgr_1' });
  await (outcome === 'rejected' ? rejectHire(hire.id) : withdrawHire(hire.id));
  await expect(updateHire(hire.id, { hireStage: 'interview' })).rejects.toMatchObject({ statusCode: 400, fields: { hireStage: expect.stringContaining('closed') } });
  expect(getHire(hire.id).hireStage).toBe('screening');
});

test.each(['reject', 'withdraw'])('AC4: %sing a deactivated hire is blocked with a field-level 400', async (action) => {
  const hire = await mk({ hireStage: 'applied' });
  await deactivateHire(hire.id);
  const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'manager').send({});
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('deactivated') } });
  expect(getHire(hire.id).profileStatus).toBe('deactivated');
});

test.each(['reject', 'withdraw'])('AC5: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
  const hire = await mk({ hireStage: 'applied' });
  const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
  expect(res.status).toBe(403);
  expect(getHire(hire.id).profileStatus).toBe('active');
});

test.each(['rejected', 'withdrawn'])('%s hire cannot be laundered to active via deactivate then reactivate', async (outcome) => {
  const hire = await mk({ hireStage: 'applied' });
  await (outcome === 'rejected' ? rejectHire(hire.id) : withdrawHire(hire.id));
  const res = await request(app).post(`/hires/${hire.id}/deactivate`).set('x-staff-role', 'hr').send({});
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('Cannot deactivate') } });
  const re = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'hr').send({});
  expect(re.status).toBe(400);
  expect(getHire(hire.id).profileStatus).toBe(outcome);
});
