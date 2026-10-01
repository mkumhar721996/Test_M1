const request = require('supertest');
const { app, bearer, adminToken, createAccount, actorWith, uniqueEmail } = require('./helpers/users-auth');

const ROLES_REQUIRED_MESSAGE = 'Select at least one role so this account has permissions to sign in with.';

async function list() {
  return request(app).get('/users').set(bearer(await adminToken()));
}

test('AC1: creating a new user account with at least one role assigned creates the account', async () => {
  const email = uniqueEmail('route.jordan');
  const res = await createAccount({ name: 'Jordan Avery', email, roles: ['employee'] });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Jordan Avery', email, roles: ['employee'], status: 'active' });
});

test('AC2: the new account appears in the user list', async () => {
  const email = uniqueEmail('route.taylor');
  await createAccount({ name: 'Taylor Shaw', email, roles: ['employee'] });
  const res = await list();
  expect(res.status).toBe(200);
  expect(res.body.some((u) => u.email === email)).toBe(true);
});

test('AC3: creating a user with no roles is rejected with an error message', async () => {
  const email = uniqueEmail('route.norole');
  const res = await createAccount({ name: 'No Role', email, roles: [] });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('validation_error');
  expect(res.body.fields.roles).toBe(ROLES_REQUIRED_MESSAGE);
  expect((await list()).body.some((u) => u.email === email)).toBe(false);
});

test('AC3: creating a user with the roles field omitted is also rejected', async () => {
  const res = await createAccount({ name: 'No Role', email: uniqueEmail('route.omitted') });
  expect(res.status).toBe(400);
  expect(res.body.fields.roles).toBe(ROLES_REQUIRED_MESSAGE);
});

test('creating a user with a duplicate email is rejected on the email field', async () => {
  const email = uniqueEmail('route.dupe');
  await createAccount({ name: 'First', email, roles: ['employee'] });
  const res = await createAccount({ name: 'Second', email, roles: ['employee'] });
  expect(res.status).toBe(400);
  expect(res.body.fields.email).toBeTruthy();
});

test('POST /users only accepts name, email and roles: client-supplied status, id and password are ignored', async () => {
  const email = uniqueEmail('route.mass');
  const res = await createAccount({
    name: 'Mass Assign',
    email,
    roles: ['employee'],
    status: 'deactivated',
    id: 'usr_001',
    password: 'test-client-chosen',
  });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('active');
  expect(res.body.id).not.toBe('usr_001');
  const signIn = await request(app).post('/users/sign-in').send({ email, password: 'test-client-chosen' });
  expect(signIn.status).toBe(401);
});

test('AC5: role changes update the same account in place and never create a new one', async () => {
  const email = uniqueEmail('route.devon');
  const created = await createAccount({ name: 'Devon Ruiz', email, roles: ['employee'] });
  const id = created.body.id;
  const admin = bearer(await adminToken());
  const patch = await request(app).patch(`/users/${id}/roles`).set(admin).send({ roles: ['employee', 'finance'] });
  expect(patch.status).toBe(200);
  const afterGrant = await list();
  expect(afterGrant.body.filter((u) => u.email === email)).toHaveLength(1);
  expect(afterGrant.body.find((u) => u.id === id).roles).toEqual(['employee', 'finance']);
  await request(app).patch(`/users/${id}/roles`).set(admin).send({ roles: ['employee'] });
  expect((await list()).body.find((u) => u.id === id).roles).toEqual(['employee']);
});

test('AC5: removing every role is rejected with the roles error and the account keeps its roles', async () => {
  const created = await createAccount({ name: 'Keep', email: uniqueEmail('route.keep'), roles: ['finance'] });
  const res = await request(app).patch(`/users/${created.body.id}/roles`).set(bearer(await adminToken())).send({ roles: [] });
  expect(res.status).toBe(400);
  expect(res.body.fields.roles).toBe(ROLES_REQUIRED_MESSAGE);
  expect((await list()).body.find((u) => u.id === created.body.id).roles).toEqual(['finance']);
});

test('PATCH /users/:id/roles returns 404 for an unknown id', async () => {
  const res = await request(app).patch('/users/missing/roles').set(bearer(await adminToken())).send({ roles: ['employee'] });
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'user not found' });
});

test('AC7/AC9: deactivating flips status to deactivated and the account stays in the list', async () => {
  const created = await createAccount({ name: 'Elena Brooks', email: uniqueEmail('route.elena'), roles: ['employee'] });
  const res = await request(app).post(`/users/${created.body.id}/deactivate`).set(bearer(await adminToken()));
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('deactivated');
  expect((await list()).body.find((u) => u.id === created.body.id)).toMatchObject({ status: 'deactivated', name: 'Elena Brooks' });
});

test('reactivating a deactivated account makes it active again', async () => {
  const created = await createAccount({ name: 'Back Again', email: uniqueEmail('route.back'), roles: ['employee'] });
  const admin = bearer(await adminToken());
  await request(app).post(`/users/${created.body.id}/deactivate`).set(admin);
  const res = await request(app).post(`/users/${created.body.id}/reactivate`).set(admin);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('active');
});

test('deactivate and reactivate return 404 for an unknown id', async () => {
  const admin = bearer(await adminToken());
  expect((await request(app).post('/users/missing/deactivate').set(admin)).status).toBe(404);
  expect((await request(app).post('/users/missing/reactivate').set(admin)).status).toBe(404);
});

test('a finance-only account can also manage users', async () => {
  const finance = await actorWith(['finance'], 'route.finance');
  const res = await createAccount({ name: 'By Finance', email: uniqueEmail('route.byfinance'), roles: ['employee'] }, finance.token);
  expect(res.status).toBe(201);
});
