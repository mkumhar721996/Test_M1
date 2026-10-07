const request = require('supertest');
const app = require('../src/server');
const { listDefects } = require('../src/defects/store');

test('creating a defect with any details sets status to New', async () => {
  const res = await request(app).post('/defects').send({ title: 'Checkout button unresponsive on Safari' });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('New');
});

test('the persisted defect contains exactly what was entered', async () => {
  const payload = { title: 'Bug', description: 'Desc', steps: 'Steps', environment: 'Env', severity: 'High', reportedBy: 'Jordan Lee' };
  const res = await request(app).post('/defects').send(payload);
  expect(res.body).toMatchObject(payload);

  const minimal = await request(app).post('/defects').send({ title: 'Minimal' });
  expect(minimal.body).toMatchObject({ title: 'Minimal', description: '', steps: '', environment: '', severity: '' });

  const spoofed = await request(app).post('/defects').send({ title: 'X', status: 'Resolved', id: 'DEF-9999' });
  expect(spoofed.body.status).toBe('New');
  expect(spoofed.body.id).not.toBe('DEF-9999');

  const fetched = await request(app).get(`/defects/${res.body.id}`);
  expect(fetched.body).toEqual(res.body);
});

test('submitting with no details is rejected and creates nothing', async () => {
  const before = listDefects().length;
  const res = await request(app).post('/defects').send({});
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'validation_error', fields: { title: 'Add a title before submitting.' } });
  expect(listDefects().length).toBe(before);
});

test('non-string text fields and unknown severities are rejected with 400, not 500', async () => {
  const before = listDefects().length;
  const badTitle = await request(app).post('/defects').send({ title: 123 });
  expect(badTitle.status).toBe(400);
  expect(badTitle.body.fields).toHaveProperty('title');

  const badDescription = await request(app).post('/defects').send({ title: 'T', description: { a: 1 } });
  expect(badDescription.status).toBe(400);
  expect(badDescription.body.fields).toHaveProperty('description');

  const badSeverity = await request(app).post('/defects').send({ title: 'T', severity: 'Apocalyptic' });
  expect(badSeverity.status).toBe(400);
  expect(badSeverity.body.fields).toHaveProperty('severity');

  const badReporter = await request(app).post('/defects').send({ title: 'T', reportedBy: { x: 1 } });
  expect(badReporter.status).toBe(400);
  expect(badReporter.body.fields).toHaveProperty('reportedBy');

  expect(listDefects().length).toBe(before);
});
