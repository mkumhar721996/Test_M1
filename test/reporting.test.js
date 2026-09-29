const request = require('supertest');

function freshApp() {
  jest.resetModules();
  return require('../src/server');
}

describe('reporting routes', () => {
  test('AC5: PUT /reporting/retention-settings from a non-admin role is rejected', async () => {
    const app = freshApp();
    const res = await request(app).put('/reporting/retention-settings')
      .set('x-staff-role', 'recruiter')
      .send({ retentionMonths: 1, actor: 'Priya Sharma' });
    expect(res.status).toBe(403);
  });

  test('EDGE: GET /reporting/retention-settings succeeds for a non-admin role (read-only access)', async () => {
    const app = freshApp();
    const res = await request(app).get('/reporting/retention-settings').set('x-staff-role', 'recruiter');
    expect(res.status).toBe(200);
    expect(typeof res.body.retentionMonths).toBe('number');
  });

  test('AC6: after a rejected non-admin change, GET /reporting/retention-settings still returns the old value', async () => {
    const app = freshApp();
    const before = (await request(app).get('/reporting/retention-settings')).body.retentionMonths;
    await request(app).put('/reporting/retention-settings').set('x-staff-role', 'recruiter').send({ retentionMonths: 1, actor: 'Priya Sharma' });
    const after = await request(app).get('/reporting/retention-settings');
    expect(after.body.retentionMonths).toBe(before);
  });

  test('AC4: a tenant admin can update the retention period via PUT and receive the new value back', async () => {
    const app = freshApp();
    const res = await request(app).put('/reporting/retention-settings').set('x-staff-role', 'tenant_admin').send({ retentionMonths: 7, actor: 'Jane Kim' });
    expect(res.status).toBe(200);
    expect(res.body.retentionMonths).toBe(7);
  });

  test('EDGE: an invalid retentionMonths value is rejected with 400', async () => {
    const app = freshApp();
    const res = await request(app).put('/reporting/retention-settings').set('x-staff-role', 'tenant_admin').send({ retentionMonths: 0, actor: 'Jane Kim' });
    expect(res.status).toBe(400);
  });

  test('AC1/AC2/AC3: GET /reporting/hires returns the seeded fixture hires', async () => {
    const app = freshApp();
    const res = await request(app).get('/reporting/hires');
    expect(res.status).toBe(200);
    expect(res.body.some((h) => h.id === 'hire-101')).toBe(true);
  });

  test('AC8: GET /reporting/hires/:id for a swept hire returns 410 with only tombstone fields', async () => {
    const app = freshApp();
    const eventDate = new Date();
    eventDate.setMonth(eventDate.getMonth() - 20);
    await request(app).put('/reporting/retention-settings').set('x-staff-role', 'tenant_admin').send({ retentionMonths: 1, actor: 'Jane Kim' });
    const res = await request(app).get('/reporting/hires/hire-104');
    expect(res.status).toBe(410);
    expect(res.body.tombstone.metrics).toBeUndefined();
  });

  test('EDGE: GET /reporting/hires/:id for an id that never existed returns 404, not 410', async () => {
    const app = freshApp();
    const res = await request(app).get('/reporting/hires/never-existed-id');
    expect(res.status).toBe(404);
  });

  test('EDGE: audit-log filtering returns only entries matching the requested type', async () => {
    const app = freshApp();
    await request(app).put('/reporting/retention-settings').set('x-staff-role', 'tenant_admin').send({ retentionMonths: 5, actor: 'Jane Kim' });
    await request(app).put('/reporting/retention-settings').set('x-staff-role', 'recruiter').send({ retentionMonths: 1, actor: 'Priya Sharma' });
    const configRes = await request(app).get('/reporting/audit-log').query({ type: 'config' });
    const deniedRes = await request(app).get('/reporting/audit-log').query({ type: 'denied' });
    expect(configRes.body.every((e) => e.type === 'config')).toBe(true);
    expect(deniedRes.body.every((e) => e.type === 'denied')).toBe(true);
  });
});
