const { app, SEED_EMAIL, SEED_PASSWORD, bearer, signInAs, adminToken, createAccount, actorWith, uniqueEmail } = require('./helpers/users-auth');
const request = require('supertest');
const sessions = require('../src/users/sessions');

test('sign-in issues an opaque, unguessable session token', async () => {
  const a = await signInAs(SEED_EMAIL, SEED_PASSWORD);
  const b = await signInAs(SEED_EMAIL, SEED_PASSWORD);
  expect(typeof a).toBe('string');
  expect(a.length).toBeGreaterThanOrEqual(32);
  expect(a).not.toBe(b);
});

test('a failed sign-in issues no token', async () => {
  const res = await request(app).post('/users/sign-in').send({ email: SEED_EMAIL, password: 'not-the-password' });
  expect(res.status).toBe(401);
  expect(res.body.token).toBeUndefined();
});

test('requests without a token are rejected with 401', async () => {
  const res = await request(app).get('/users');
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('unauthorized');
});

test('an unknown or malformed token is rejected with 401', async () => {
  const unknown = await request(app).get('/users').set(bearer('not-a-real-token'));
  const malformed = await request(app).get('/users').set('Authorization', 'Basic abc');
  expect(unknown.status).toBe(401);
  expect(malformed.status).toBe(401);
});

test('forged identity headers grant nothing: x-staff-role and x-user-id are ignored', async () => {
  const res = await request(app).get('/users').set('x-staff-role', 'admin').set('x-user-id', 'usr_001');
  expect(res.status).toBe(401);
  const employee = await actorWith(['employee'], 'forge');
  const forged = await request(app).get('/users').set(bearer(employee.token)).set('x-staff-role', 'admin');
  expect(forged.status).toBe(403);
});

test('AC7: deactivating an account invalidates its live session on the very next request', async () => {
  const actor = await actorWith(['finance'], 'deact');
  const before = await request(app).get('/users').set(bearer(actor.token));
  expect(before.status).toBe(200);
  await request(app).post(`/users/${actor.user.id}/deactivate`).set(bearer(await adminToken()));
  const after = await request(app).get('/users').set(bearer(actor.token));
  expect(after.status).toBe(401);
});

test('a reactivated account must sign in again: its old session stays dead', async () => {
  const actor = await actorWith(['finance'], 'react');
  const admin = bearer(await adminToken());
  await request(app).post(`/users/${actor.user.id}/deactivate`).set(admin);
  await request(app).get('/users').set(bearer(actor.token));
  await request(app).post(`/users/${actor.user.id}/reactivate`).set(admin);
  const stale = await request(app).get('/users').set(bearer(actor.token));
  expect(stale.status).toBe(401);
  const fresh = await signInAs(actor.email, actor.password);
  const res = await request(app).get('/users').set(bearer(fresh));
  expect(res.status).toBe(200);
});

test('sign-out revokes the session', async () => {
  const actor = await actorWith(['admin'], 'out');
  const out = await request(app).post('/users/sign-out').set(bearer(actor.token));
  expect(out.status).toBe(204);
  const after = await request(app).get('/users').set(bearer(actor.token));
  expect(after.status).toBe(401);
});

test('sessions expire after the TTL', async () => {
  const actor = await actorWith(['admin'], 'ttl');
  const realNow = Date.now();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + sessions.SESSION_TTL_MS + 1000);
  const res = await request(app).get('/users').set(bearer(actor.token));
  spy.mockRestore();
  expect(res.status).toBe(401);
});

test('the create response includes the temporary password once; it is absent from the list', async () => {
  const email = uniqueEmail('temp');
  const created = await createAccount({ name: 'Temp Person', email, roles: ['employee'] });
  expect(created.body.temporaryPassword).toBeTruthy();
  expect(created.body).not.toHaveProperty('passwordHash');
  const list = await request(app).get('/users').set(bearer(await adminToken()));
  const listed = list.body.find((u) => u.email === email);
  expect(listed).not.toHaveProperty('temporaryPassword');
  expect(listed).not.toHaveProperty('passwordHash');
});
