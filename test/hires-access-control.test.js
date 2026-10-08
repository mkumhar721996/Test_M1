const request = require('supertest');
const app = require('../src/server');

const base = { phone: '555-0100', department: 'Engineering', role: 'Engineer', startDate: '2026-11-01' };

async function makeHire(overrides) {
  const res = await request(app).post('/hires').set('x-staff-role', 'hr').send({ ...base, email: 'a@example.com', name: 'Test Hire', ...overrides });
  return res.body;
}
const as = (req, role, name, extra = {}) => {
  let r = req.set('x-staff-role', role).set('x-tenant', extra.tenant || 'Acme Corp');
  if (name) r = r.set('x-staff-name', name);
  if (extra.hireId) r = r.set('x-hire-id', extra.hireId);
  return r;
};

test('AC1: HR admin views full profile data within the tenant', async () => {
  const hire = await makeHire({});
  const res = await as(request(app).get(`/hires/${hire.id}`), 'hr', 'Priya Shah');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: hire.id, name: hire.name, email: hire.email, department: hire.department });
});

test('requests without a role are unauthorized, unknown roles forbidden', async () => {
  expect((await request(app).get('/hires')).status).toBe(401);
  expect((await request(app).get('/hires').set('x-staff-role', 'janitor')).status).toBe(403);
});

test('AC2: HR admin edit is saved', async () => {
  const hire = await makeHire({});
  const res = await as(request(app).patch(`/hires/${hire.id}`), 'hr').send({ department: 'Product' });
  expect(res.status).toBe(200);
  expect(res.body.department).toBe('Product');
});

test('AC3: HR admin deactivation takes effect', async () => {
  const hire = await makeHire({});
  const res = await as(request(app).post(`/hires/${hire.id}/deactivate`), 'hr');
  expect(res.status).toBe(200);
  expect(res.body.profileStatus).toBe('deactivated');
});

test('mutations across tenants are forbidden', async () => {
  const globex = await makeHire({ tenant: 'Globex Corp' });
  const res = await as(request(app).patch(`/hires/${globex.id}`), 'hr').send({ department: 'Product' });
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'forbidden', reason: 'cross_tenant' });
  expect((await as(request(app).post(`/hires/${globex.id}/deactivate`), 'hr')).status).toBe(403);
  expect((await as(request(app).post(`/hires/${globex.id}/reactivate`), 'hr')).status).toBe(403);
});

test('AC4: manager list shows only current direct reports', async () => {
  const a = await makeHire({ hiringManager: 'Dana Brooks' });
  const b = await makeHire({ hiringManager: 'Marcus Chen' });
  const res = await as(request(app).get('/hires'), 'manager', 'Dana Brooks');
  const ids = res.body.map((h) => h.id);
  expect(ids).toContain(a.id);
  expect(ids).not.toContain(b.id);
  expect(res.body.every((h) => h.hiringManager === 'Dana Brooks')).toBe(true);
});

test('HR list excludes other tenants; new hire gets no roster', async () => {
  const globex = await makeHire({ tenant: 'Globex Corp' });
  const hr = await as(request(app).get('/hires'), 'hr', 'Priya Shah');
  expect(hr.body.map((h) => h.id)).not.toContain(globex.id);
  const nh = await as(request(app).get('/hires'), 'new_hire', 'Jordan', { hireId: 'x' });
  expect(nh.body).toEqual([]);
});

test('AC5: manager with no direct reports gets an empty list', async () => {
  const res = await as(request(app).get('/hires'), 'manager', 'Elena Nobody');
  expect(res.body).toEqual([]);
});

test('AC6/AC7: reassigning a direct report moves access immediately', async () => {
  const hire = await makeHire({ hiringManager: 'Marcus Chen' });
  await as(request(app).patch(`/hires/${hire.id}`), 'hr').send({ hiringManager: 'Elena Vance' });
  const gained = await as(request(app).get(`/hires/${hire.id}`), 'manager', 'Elena Vance');
  expect(gained.status).toBe(200);
  const lost = await as(request(app).get(`/hires/${hire.id}`), 'manager', 'Marcus Chen');
  expect(lost.status).toBe(403);
  expect(lost.body.reason).toBe('not_direct_report');
});

test('AC8: new hire views own profile with onboarding status', async () => {
  const hire = await makeHire({});
  const res = await as(request(app).get(`/hires/${hire.id}`), 'new_hire', 'Test Hire', { hireId: hire.id });
  expect(res.status).toBe(200);
  expect(res.body.onboardingStatus).toBeDefined();
});

describe('AC9/AC10: out-of-scope denied with reason', () => {
  test.each([
    ['manager', 'not_direct_report'],
    ['new_hire', 'not_own_profile'],
  ])('role %s denied with %s', async (role, reason) => {
    const hire = await makeHire({ hiringManager: 'Dana Brooks' });
    const res = await as(request(app).get(`/hires/${hire.id}`), role, 'Someone Else', { hireId: 'not-this-one' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', reason });
  });

  test('HR cross-tenant denied', async () => {
    const globex = await makeHire({ tenant: 'Globex Corp' });
    const res = await as(request(app).get(`/hires/${globex.id}`), 'hr', 'Priya Shah');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', reason: 'cross_tenant' });
  });

  test('unknown id is 404', async () => {
    const res = await as(request(app).get('/hires/nope'), 'hr');
    expect(res.status).toBe(404);
  });
});
