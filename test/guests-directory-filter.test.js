const request = require('supertest');
const app = require('../src/server');

test('AC1: GET /guests excludes a deactivated guest from the default listing', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Wei Zhang', email: 'wei.zhang@example.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  const res = await request(app).get('/guests');
  expect(res.status).toBe(200);
  expect(res.body.some((g) => g.id === id)).toBe(false);
});

test('AC1: GET /guests still includes an active guest in the default listing', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Sofia Torres', email: 'sofia.torres@example.com', actor: 'Priya Nair' });
  const { id } = createRes.body;
  const res = await request(app).get('/guests');
  expect(res.status).toBe(200);
  expect(res.body.some((g) => g.id === id)).toBe(true);
});

test('AC3: GET /guests/:id returns a deactivated guest in full even though it is excluded from the listing', async () => {
  const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Elena Kim', phone: '555-7300', actor: 'Priya Nair' });
  const { id } = createRes.body;
  await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
  const listRes = await request(app).get('/guests');
  expect(listRes.body.some((g) => g.id === id)).toBe(false);
  const getRes = await request(app).get(`/guests/${id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body).toMatchObject({ id, name: 'Elena Kim', status: 'deactivated' });
});
