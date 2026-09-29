const request = require('supertest');
const app = require('../src/server');
const { createHire } = require('../src/hires/store');

test('GET /dashboard reflects an overdue hire seeded with a past stageEnteredAt', async () => {
  const past = new Date(Date.now() - 8 * 86400000).toISOString();
  await createHire({
    name: 'Jordan Reyes', email: 'j@x.com', phone: '1', startDate: '2026-10-05',
    department: 'Engineering', role: 'SE II', hireStage: 'background_check',
    stageEnteredAt: past, lastActivityAt: new Date().toISOString(),
  });
  const res = await request(app).get('/dashboard').set('x-staff-role', 'hr_admin');
  expect(res.status).toBe(200);
  const stage = res.body.stages.find((s) => s.stage.id === 'background_check');
  expect(stage.hires.some((h) => h.hire.name === 'Jordan Reyes' && h.flags.isOverdue)).toBe(true);
});

test('GET /dashboard excludes a deactivated hire from stage groups', async () => {
  const createRes = await request(app).post('/hires').send({
    name: 'Deactivated Person', email: 'd@x.com', phone: '1', startDate: '2026-10-05',
    department: 'Sales', role: 'AE', hireStage: 'paperwork',
  });
  await request(app).post(`/hires/${createRes.body.id}/deactivate`);
  const res = await request(app).get('/dashboard').set('x-staff-role', 'hr_admin');
  const stage = res.body.stages.find((s) => s.stage.id === 'paperwork');
  expect(stage.hires.some((h) => h.hire.name === 'Deactivated Person')).toBe(false);
});

test('security: GET /dashboard is forbidden without an HR admin role (interim header-based gate, pending real session auth)', async () => {
  const res = await request(app).get('/dashboard');
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
});

test('security: GET /dashboard is forbidden for a non-admin staff role', async () => {
  const res = await request(app).get('/dashboard').set('x-staff-role', 'front_desk');
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden' });
});

test('security: POST /hires ignores a client-supplied stageEnteredAt, so it cannot fabricate an overdue hire', async () => {
  const past = new Date(Date.now() - 30 * 86400000).toISOString();
  const createRes = await request(app).post('/hires').send({
    name: 'Spoofed Overdue', email: 'spoof@x.com', phone: '1', startDate: '2026-10-05',
    department: 'Engineering', role: 'SE', hireStage: 'background_check',
    stageEnteredAt: past, lastActivityAt: past,
  });
  expect(createRes.body.stageEnteredAt).not.toBe(past);

  const res = await request(app).get('/dashboard').set('x-staff-role', 'hr_admin');
  const stage = res.body.stages.find((s) => s.stage.id === 'background_check');
  const seeded = stage.hires.find((h) => h.hire.name === 'Spoofed Overdue');
  expect(seeded.flags.isOverdue).toBe(false);
});
