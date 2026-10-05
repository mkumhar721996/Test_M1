const request = require('supertest');
const app = require('../src/server');
const { createHire, getHire, updateHire } = require('../src/hires/store');

test('AC1: createHire persists a profile when name, department, role, and start date are present', async () => {
  const hire = await createHire({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' });
  expect(getHire(hire.id)).toMatchObject({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' });
});

test.each([
  ['name', { department: 'Sales', role: 'AE', startDate: '2026-10-05' }, 'Full name is required.'],
  ['department', { name: 'A', role: 'AE', startDate: '2026-10-05' }, 'Department is required.'],
  ['role', { name: 'A', department: 'Sales', startDate: '2026-10-05' }, 'Role is required.'],
  ['startDate', { name: 'A', department: 'Sales', role: 'AE' }, 'Start date is required.'],
])('AC3/AC4: createHire rejects a submission missing %s and names that field', async (field, payload, message) => {
  await expect(createHire(payload)).rejects.toMatchObject({ statusCode: 400, fields: { [field]: message } });
});

test('AC5: createHire succeeds with email and phone left blank when every required field is present', async () => {
  const hire = await createHire({ name: 'Robin Tran', department: 'Finance', role: 'Analyst', startDate: '2026-12-10' });
  expect(hire.id).toBeTruthy();
  expect(getHire(hire.id).name).toBe('Robin Tran');
});

test('AC2: updateHire persists edits to contact info, department/role, start date, and hire stage', async () => {
  const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05' });
  const updated = await updateHire(hire.id, { email: 'a@x.com', phone: '555-1212', department: 'Product', role: 'PM', startDate: '2026-11-01', hireStage: 'offer_accepted' });
  expect(updated).toMatchObject({ email: 'a@x.com', phone: '555-1212', department: 'Product', role: 'PM', startDate: '2026-11-01', hireStage: 'offer_accepted' });
});

test('AC3/AC4: updateHire rejects clearing department and leaves the stored profile unchanged', async () => {
  const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05' });
  await expect(updateHire(hire.id, { department: '', hireStage: 'offer_accepted' })).rejects.toMatchObject({ fields: { department: 'Department is required.' } });
  expect(getHire(hire.id).department).toBe('Engineering');
  expect(getHire(hire.id).hireStage).not.toBe('offer_accepted');
  expect(getHire(hire.id).run).toBeNull();
});

test('AC6: a new profile created for a person with a prior profile has its own id and no link field', async () => {
  const prior = await createHire({ name: 'Sam Okafor', department: 'Sales', role: 'Account Executive', startDate: '2025-03-10', hireStage: 'completed' });
  const rehire = await createHire({ name: 'Sam Okafor', department: 'Product', role: 'Senior Product Manager', startDate: '2026-11-16', hireStage: 'draft' });
  expect(rehire.id).not.toBe(prior.id);
  expect(rehire).not.toHaveProperty('priorProfileId');
  expect(rehire).not.toHaveProperty('linkedProfileId');
});

test('POST /hires with a missing required field returns 400 validation_error naming the field', async () => {
  const res = await request(app).post('/hires').set('x-staff-role', 'hr').send({ department: 'Sales', role: 'AE', startDate: '2026-10-05' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { name: 'Full name is required.' } });
});

test('PATCH /hires/:id clearing a required field returns 400 validation_error', async () => {
  const created = await request(app).post('/hires').set('x-staff-role', 'hr').send({ name: 'A', department: 'Sales', role: 'AE', startDate: '2026-10-05' });
  const res = await request(app).patch(`/hires/${created.body.id}`).set('x-staff-role', 'hr').send({ role: '  ' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: 'validation_error', fields: { role: 'Role is required.' } });
});
