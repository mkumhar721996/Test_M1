const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, updateHire, deactivateHire, reactivateHire } = require('../src/hires/store');

const base = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II' };
const mk = (extra = {}) => createHire({ ...base, hireStage: 'applied', ...extra });

test('AC1: PATCH stage on a deactivated hire is rejected via the HTTP route', async () => {
  const hire = await mk({ hireStage: 'applied' });
  await deactivateHire(hire.id);
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'manager').send({ hireStage: 'screening', hiringManager: 'mgr_1' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { hireStage: 'Cannot change stage on a deactivated hire.' } });
  expect(getHire(hire.id).hireStage).toBe('applied');
});

test('AC2: contact-info edits are accepted while a hire is deactivated', async () => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  await deactivateHire(hire.id);
  const updated = await updateHire(hire.id, { name: 'New Name', email: 'new@x.com', phone: '555-9999', startDate: '2026-12-01' });
  expect(updated).toMatchObject({ name: 'New Name', email: 'new@x.com', phone: '555-9999', startDate: '2026-12-01', profileStatus: 'deactivated' });
});

test('AC2: PATCH /hires/:id for contact info succeeds via the HTTP route while deactivated', async () => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  await deactivateHire(hire.id);
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'hr').send({ phone: '555-0000' });
  expect(res.status).toBe(200);
  expect(res.body.phone).toBe('555-0000');
});

test('AC3: a reactivated hire with pre-onboarding stages remaining can advance its stage', async () => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  await deactivateHire(hire.id);
  await reactivateHire(hire.id);
  const updated = await updateHire(hire.id, { hireStage: 'offer_extended' });
  expect(updated.hireStage).toBe('offer_extended');
});

test('AC4: a reactivated hire whose onboarding already triggered before deactivation cannot change stage', async () => {
  const hire = await mk({ hireStage: 'offer_accepted' });
  await deactivateHire(hire.id);
  await reactivateHire(hire.id);
  await expect(updateHire(hire.id, { hireStage: 'interview' })).rejects.toMatchObject({ statusCode: 400 });
  expect(getHire(hire.id).hireStage).toBe('offer_accepted');
});
