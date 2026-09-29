const request = require('supertest');
const app = require('../src/server');

test('GET /dashboard reflects an overdue hire created via POST /hires', async () => {
  const past = new Date(Date.now() - 8 * 86400000).toISOString();
  await request(app).post('/hires').send({
    name: 'Jordan Reyes', email: 'j@x.com', phone: '1', startDate: '2026-10-05',
    department: 'Engineering', role: 'SE II', hireStage: 'background_check',
    stageEnteredAt: past, lastActivityAt: new Date().toISOString(),
  });
  const res = await request(app).get('/dashboard');
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
  const res = await request(app).get('/dashboard');
  const stage = res.body.stages.find((s) => s.stage.id === 'paperwork');
  expect(stage.hires.some((h) => h.hire.name === 'Deactivated Person')).toBe(false);
});
