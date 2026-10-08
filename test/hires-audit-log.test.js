const request = require('supertest');
const app = require('../src/server');

const hdr = (r, role, name, tenant = 'Acme Corp') => r.set('x-staff-role', role).set('x-staff-name', name).set('x-tenant', tenant);

async function makeHire(tenant) {
  const res = await request(app).post('/hires').set('x-staff-role', 'hr')
    .send({ name: 'Audit Hire', email: 'a@example.com', phone: '1', department: 'Sales', role: 'AE', startDate: '2026-11-01', tenant, hiringManager: 'Dana Brooks' });
  return res.body;
}

test('AC11: views (allowed and denied) are logged at tenant level, newest first', async () => {
  const hire = await makeHire('Audit Tenant');
  await hdr(request(app).get(`/hires/${hire.id}`), 'hr', 'Priya Shah', 'Audit Tenant');
  await hdr(request(app).get(`/hires/${hire.id}`), 'manager', 'Someone Else', 'Audit Tenant');
  const log = await hdr(request(app).get('/hires/audit-log'), 'hr', 'Priya Shah', 'Audit Tenant');
  expect(log.status).toBe(200);
  expect(log.body[0]).toMatchObject({ result: 'denied', action: 'Attempted to view profile', actorName: 'Someone Else', targetId: hire.id });
  expect(log.body[1]).toMatchObject({ result: 'allowed', action: 'Viewed profile', actorRole: 'HR Admin' });
});

test('AC11: edit, deactivate and reactivate are logged', async () => {
  const hire = await makeHire('Audit Tenant 2');
  await hdr(request(app).patch(`/hires/${hire.id}`), 'hr', 'Priya Shah', 'Audit Tenant 2').send({ department: 'Product' });
  await hdr(request(app).post(`/hires/${hire.id}/deactivate`), 'hr', 'Priya Shah', 'Audit Tenant 2');
  await hdr(request(app).post(`/hires/${hire.id}/reactivate`), 'hr', 'Priya Shah', 'Audit Tenant 2');
  const log = await hdr(request(app).get('/hires/audit-log'), 'hr', 'Priya Shah', 'Audit Tenant 2');
  expect(log.body.map((e) => e.action)).toEqual(['Reactivated profile', 'Deactivated profile', 'Edited profile']);
});

test('AC11: denied cross-tenant mutation is logged to the actor tenant', async () => {
  const hire = await makeHire('Other Tenant');
  await hdr(request(app).patch(`/hires/${hire.id}`), 'hr', 'Priya Shah', 'Audit Tenant 3').send({ department: 'Product' });
  const log = await hdr(request(app).get('/hires/audit-log'), 'hr', 'Priya Shah', 'Audit Tenant 3');
  expect(log.body[0]).toMatchObject({ action: 'Attempted to edit profile', result: 'denied' });
});

test('audit log is tenant scoped and hr only', async () => {
  const log = await hdr(request(app).get('/hires/audit-log'), 'hr', 'Priya Shah', 'Empty Tenant');
  expect(log.body).toEqual([]);
  const res = await hdr(request(app).get('/hires/audit-log'), 'manager', 'Dana Brooks');
  expect(res.status).toBe(403);
});
