const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, updateHire, deactivateHire } = require('../src/hires/store');

const base = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II' };
const mk = (extra = {}) => createHire({ ...base, hireStage: 'applied', ...extra });

test('AC1: applied -> screening with hiringManager succeeds', async () => {
  const hire = await mk();
  const updated = await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
  expect(updated.hireStage).toBe('screening');
});

test.each(['hr', 'manager'])('AC1: PATCH as %s advances to screening', async (role) => {
  const hire = await mk();
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', role).send({ hireStage: 'screening', hiringManager: 'mgr_1' });
  expect(res.status).toBe(200);
  expect(res.body.hireStage).toBe('screening');
});

test('AC2: moving back from interview is blocked', async () => {
  const hire = await mk();
  await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
  await updateHire(hire.id, { hireStage: 'interview' });
  await expect(updateHire(hire.id, { hireStage: 'screening' }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Stage cannot move backward.' } });
  expect(getHire(hire.id).hireStage).toBe('interview');
});

test('AC3: skipping ahead is blocked', async () => {
  const hire = await mk();
  await expect(updateHire(hire.id, { hireStage: 'interview', hiringManager: 'mgr_1' }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Stage cannot skip ahead.' } });
  expect(getHire(hire.id).hireStage).toBe('applied');
});

test('AC4: hiringManager is not a permission gate', async () => {
  const hire = await mk({ hireStage: 'screening', hiringManager: 'mgr_other' });
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'hr').send({ hireStage: 'interview' });
  expect(res.status).toBe(200);
  expect(res.body.hireStage).toBe('interview');
});

test('AC5: screening without hiringManager is blocked (store and route)', async () => {
  const hire = await mk();
  await expect(updateHire(hire.id, { hireStage: 'screening' }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
  const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'manager').send({ hireStage: 'screening' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
});

test('AC6: reaching offer_accepted through the pipeline triggers the onboarding run', async () => {
  const hire = await mk();
  await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
  await updateHire(hire.id, { hireStage: 'interview' });
  await updateHire(hire.id, { hireStage: 'offer_extended' });
  const updated = await updateHire(hire.id, { hireStage: 'offer_accepted' });
  expect(updated.run).toMatchObject({ status: 'active', department: hire.department, role: hire.role });
});

test('AC7: deactivated hire cannot advance', async () => {
  const hire = await mk();
  await deactivateHire(hire.id);
  await expect(updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Cannot change stage on a deactivated hire.' } });
});

test.each(['draft', 'banana'])('pipeline stage cannot move to non-pipeline value %s', async (value) => {
  const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
  await expect(updateHire(hire.id, { hireStage: value }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Stage must be a valid pipeline stage.' } });
  expect(getHire(hire.id).hireStage).toBe('interview');
});

test.each([null, '', '   '])('hiringManager cannot be cleared (%j) at screening or later', async (value) => {
  const hire = await mk({ hireStage: 'screening', hiringManager: 'mgr_1' });
  await expect(updateHire(hire.id, { hiringManager: value }))
    .rejects.toMatchObject({ statusCode: 400, fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
  expect(getHire(hire.id).hiringManager).toBe('mgr_1');
});

test('blank hiringManager is rejected when advancing to screening', async () => {
  const hire = await mk();
  await expect(updateHire(hire.id, { hireStage: 'screening', hiringManager: '  ' }))
    .rejects.toMatchObject({ fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
});
