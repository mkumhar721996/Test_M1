const request = require('supertest');
const app = require('../src/server');

test('AC1: creating a guest with name and a contact detail assigns a unique id', async () => {
  const res = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Ana Cruz', email: 'ana@example.com', actor: 'Priya Nair' });
  expect(res.status).toBe(201);
  expect(typeof res.body.id).toBe('string');
  expect(res.body.id.length).toBeGreaterThan(0);
});

test('AC1 (validation): a guest with no email or phone is rejected', async () => {
  const res = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'No Contact' });
  expect(res.status).toBe(400);
});

test('AC2: a newly created guest profile is immediately retrievable by id', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Ben Ortiz', phone: '555-0001', actor: 'Priya Nair' });
  const getRes = await request(app).get(`/guests/${createRes.body.id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body.name).toBe('Ben Ortiz');
});

test('AC3: GET /guests/:id returns the full profile', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({
    name: 'Carla Nunez', email: 'c@x.com', roomType: 'Ocean view', dietary: 'Vegan', communication: 'Email', actor: 'Priya Nair',
  });
  const res = await request(app).get(`/guests/${createRes.body.id}`);
  expect(res.body).toMatchObject({
    name: 'Carla Nunez', email: 'c@x.com',
    preferences: { roomType: 'Ocean view', dietary: 'Vegan', communication: 'Email' },
  });
  expect(Array.isArray(res.body.bookingHistory)).toBe(true);
});

test('AC4: PATCH updates only the supplied field and leaves others unchanged', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Dana Price', email: 'd@x.com', phone: '555-0002', roomType: 'High floor', actor: 'Priya Nair' });
  const { id } = createRes.body;
  const patchRes = await request(app).patch(`/guests/${id}`).send({ phone: '555-9999', actor: 'Priya Nair' });
  expect(patchRes.status).toBe(200);
  expect(patchRes.body.phone).toBe('555-9999');
  expect(patchRes.body.email).toBe('d@x.com');
  expect(patchRes.body.preferences.roomType).toBe('High floor');
});

test('AC5: deactivating an active profile changes status to deactivated', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Eli Frank', email: 'e@x.com', actor: 'Priya Nair' });
  const res = await request(app).post(`/guests/${createRes.body.id}/deactivate`).send({ actor: 'Priya Nair' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('deactivated');
});

test('AC6: booking history remains retrievable after soft-delete', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Faye Kim', email: 'f@x.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  const res = await request(app).get(`/guests/${id}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.bookingHistory)).toBe(true);
});

test('AC7: reactivating returns status to active', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Gus Ito', email: 'g@x.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  const res = await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('active');
});

test('AC8: a reactivated profile can be updated and deactivated again', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Hana Seo', email: 'h@x.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
  const patchRes = await request(app).patch(`/guests/${id}`).send({ phone: '555-0003', actor: 'Priya Nair' });
  expect(patchRes.status).toBe(200);
  const deactivateAgainRes = await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  expect(deactivateAgainRes.status).toBe(200);
  expect(deactivateAgainRes.body.status).toBe('deactivated');
});

test('AC9: every mutating operation appends an audit record with actor and timestamp', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Ivy Leon', email: 'i@x.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).patch(`/guests/${id}`).send({ phone: '555-0004', actor: 'Priya Nair' });
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
  const res = await request(app).get(`/guests/${id}`);
  expect(res.body.auditLog).toHaveLength(4);
  res.body.auditLog.forEach((entry) => {
    expect(entry.actor).toBe('Priya Nair');
    expect(typeof entry.ts).toBe('string');
  });
});

test('AC10: GET /guests/:id for an unknown id returns 404 and no profile data', async () => {
  const res = await request(app).get('/guests/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body.name).toBeUndefined();
});

test('AC11: PATCH /guests/:id for an unknown id returns 404', async () => {
  const res = await request(app).patch('/guests/does-not-exist').send({ phone: '555-0' });
  expect(res.status).toBe(404);
});

test('AC12: POST /guests/:id/deactivate for an unknown id returns 404', async () => {
  const res = await request(app).post('/guests/does-not-exist/deactivate').send({ actor: 'Priya Nair' });
  expect(res.status).toBe(404);
});

test('Duplicate detection AC1: GET /guests/duplicates surfaces a match by email (case-insensitive) without creating anything', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Nora Diaz', email: 'nora@example.com', actor: 'Priya Nair' });
  const before = await request(app).get('/guests');
  const res = await request(app).get('/guests/duplicates').query({ email: 'NORA@example.com', phone: '' });
  expect(res.status).toBe(200);
  expect(res.body.matches).toHaveLength(1);
  expect(res.body.matches[0].guest.id).toBe(createRes.body.id);
  expect(res.body.matches[0].reasons).toEqual(['email']);
  const after = await request(app).get('/guests');
  expect(after.body.length).toBe(before.body.length);
});

test('Duplicate detection AC1: GET /guests/duplicates surfaces a match by phone regardless of formatting', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Oscar Vega', phone: '(555) 214-7788', actor: 'Priya Nair' });
  const res = await request(app).get('/guests/duplicates').query({ email: '', phone: '5552147788' });
  expect(res.status).toBe(200);
  expect(res.body.matches).toHaveLength(1);
  expect(res.body.matches[0].guest.id).toBe(createRes.body.id);
  expect(res.body.matches[0].reasons).toEqual(['phone']);
});

test('Duplicate detection AC6: GET /guests/duplicates returns no matches when nothing matches', async () => {
  const res = await request(app).get('/guests/duplicates').query({ email: 'nobody@example.com', phone: '5550000000' });
  expect(res.status).toBe(200);
  expect(res.body.matches).toEqual([]);
});
